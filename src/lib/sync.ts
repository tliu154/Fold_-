/**
 * op 同步引擎（阶段 1 实装）
 *
 * 执行顺序铁律（不可调换）：
 *   落 pending_ops →（审批）→ 行级 JSON 快照受影响数据 → 应用 op
 *   → 写 applied_ops 审计（含快照路径）→ 全库 version + 1
 *
 * - 全库版本号存 memory 表（scope='system', key='db_version'），不新增表
 * - 幂等：op_id 已存在 → duplicate，不重复应用
 * - 冲突：base_version ≠ 当前库版本（非 create 类）→ conflict，禁止自动合并
 * - AUTO_APPROVE_CREATE=true 时 create 类在 push 时自动批准；delete 永远人工批准
 * - 软删除：delete 只写 deleted_at；快照文件可用于恢复
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { getDb } from "./db";
import { getAutoApproveCreate, getDataDir } from "./config";

export type OpType =
  | "create"
  | "update"
  | "delete"
  | "tag"
  | "complete"
  | "expense_add";

export const OP_TYPES: OpType[] = [
  "create",
  "update",
  "delete",
  "tag",
  "complete",
  "expense_add",
];

/** create 类 op（新建条目，无 base_version 依赖） */
function isCreateClass(type: OpType): boolean {
  return type === "create" || type === "expense_add";
}

export interface OpPayload {
  /** create 时客户端生成的条目 id（缺省由服务端生成） */
  id?: string;
  title?: string;
  content?: string;
  /** 合并进 items.payload 的增量字段（tags/status/due_at/amount...） */
  meta?: Record<string, unknown>;
  /** tag 类 op 追加的标签 */
  tags?: string[];
}

export interface IncomingOp {
  op_id: string;
  device_id: string;
  type: OpType;
  target_id: string | null;
  item_type: string | null;
  payload: OpPayload;
  base_version: number;
  client_seq?: number | null;
  created_at: string;
}

interface PendingOpRow {
  op_id: string;
  device_id: string;
  type: string;
  target_id: string | null;
  item_type: string | null;
  payload: string;
  base_version: number | null;
  client_seq: number | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  payload: string | null;
  version: number;
  origin_device: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

function hashOf(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/* ================= 全库版本号（memory 表） ================= */

export function getDbVersion(db: Database.Database = getDb()): number {
  const row = db
    .prepare("SELECT value FROM memory WHERE scope = 'system' AND key = 'db_version'")
    .get() as { value: string } | undefined;
  if (!row) return 0;
  try {
    return Number(JSON.parse(row.value));
  } catch {
    return 0;
  }
}

function setDbVersionTx(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO memory (scope, key, value, updated_at) VALUES ('system', 'db_version', ?, ?)
     ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(JSON.stringify(version), nowIso());
}

/* ================= 快照（行级 JSON 文件） ================= */

function writeSnapshotFile(op: IncomingOp, before: ItemRow | undefined): string {
  if (!before) return ""; // create 类无前置状态，无快照文件
  const day = nowIso().slice(0, 10).replace(/-/g, "");
  const dir = path.join(getDataDir(), "snapshots", day);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${op.op_id}__${before.id}.json`);
  const body = {
    reason: "pre_apply",
    op_id: op.op_id,
    target_id: op.target_id,
    captured_at: nowIso(),
    item: before,
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf-8");
  return file;
}

/* ================= 基础查询 ================= */

function getOpRow(db: Database.Database, opId: string): PendingOpRow | undefined {
  return db.prepare("SELECT * FROM pending_ops WHERE op_id = ?").get(opId) as
    | PendingOpRow
    | undefined;
}

function getItem(db: Database.Database, id: string | null): ItemRow | undefined {
  if (!id) return undefined;
  return db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
}

function parseOpPayload(row: PendingOpRow): OpPayload {
  try {
    return JSON.parse(row.payload) as OpPayload;
  } catch {
    return {};
  }
}

function rowToIncoming(row: PendingOpRow): IncomingOp {
  return {
    op_id: row.op_id,
    device_id: row.device_id,
    type: row.type as OpType,
    target_id: row.target_id,
    item_type: row.item_type,
    payload: parseOpPayload(row),
    base_version: row.base_version ?? 0,
    client_seq: row.client_seq,
    created_at: row.created_at,
  };
}

/* ================= 应用变更（单条 op 的写库逻辑） ================= */

interface ApplyResult {
  ok: boolean;
  itemId?: string;
  reason?: string;
}

function applyChange(db: Database.Database, op: IncomingOp): ApplyResult {
  const now = nowIso();

  switch (op.type) {
    case "create":
    case "expense_add": {
      const id = op.payload.id || uuid();
      const type = op.type === "expense_add" ? "expense" : op.item_type || "note";
      db.prepare(
        `INSERT INTO items (id, type, title, content, payload, version, origin_device, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
      ).run(
        id,
        type,
        op.payload.title ?? null,
        op.payload.content ?? null,
        JSON.stringify(op.payload.meta ?? {}),
        op.device_id,
        now,
        now
      );
      return { ok: true, itemId: id };
    }

    case "update": {
      const row = getItem(db, op.target_id);
      if (!row) return { ok: false, reason: "目标条目不存在" };
      if (row.deleted_at) return { ok: false, reason: "目标条目已删除（软删除墓碑）" };
      const title = op.payload.title !== undefined ? op.payload.title : row.title;
      const content = op.payload.content !== undefined ? op.payload.content : row.content;
      const mergedMeta = { ...JSON.parse(row.payload || "{}"), ...(op.payload.meta ?? {}) };
      db.prepare(
        `UPDATE items SET title = ?, content = ?, payload = ?, version = version + 1, updated_at = ?
         WHERE id = ?`
      ).run(title, content, JSON.stringify(mergedMeta), now, row.id);
      return { ok: true, itemId: row.id };
    }

    case "delete": {
      const row = getItem(db, op.target_id);
      if (!row) return { ok: false, reason: "目标条目不存在" };
      if (row.deleted_at) return { ok: true, itemId: row.id }; // 已删除，幂等
      db.prepare(
        `UPDATE items SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ?`
      ).run(now, now, row.id);
      return { ok: true, itemId: row.id };
    }

    case "tag": {
      const row = getItem(db, op.target_id);
      if (!row) return { ok: false, reason: "目标条目不存在" };
      if (row.deleted_at) return { ok: false, reason: "目标条目已删除" };
      const meta = JSON.parse(row.payload || "{}") as Record<string, unknown>;
      const existing = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
      const added = op.payload.tags ?? [];
      meta.tags = Array.from(new Set([...existing, ...added]));
      db.prepare(
        `UPDATE items SET payload = ?, version = version + 1, updated_at = ? WHERE id = ?`
      ).run(JSON.stringify(meta), now, row.id);
      return { ok: true, itemId: row.id };
    }

    case "complete": {
      const row = getItem(db, op.target_id);
      if (!row) return { ok: false, reason: "目标条目不存在" };
      if (row.deleted_at) return { ok: false, reason: "目标条目已删除" };
      const meta = JSON.parse(row.payload || "{}") as Record<string, unknown>;
      meta.status = "done";
      db.prepare(
        `UPDATE items SET payload = ?, version = version + 1, updated_at = ? WHERE id = ?`
      ).run(JSON.stringify(meta), now, row.id);
      return { ok: true, itemId: row.id };
    }

    default:
      return { ok: false, reason: `未知 op 类型：${op.type}` };
  }
}

/* ================= 审批核心（快照 → 应用 → 审计 → version+1） ================= */

export interface ApproveResult {
  ok: boolean;
  error?: string;
  op_id: string;
  applied: boolean;
  reject_reason?: string;
  snapshot_path?: string;
  db_version?: number;
}

/**
 * 批准并应用一条 op。
 * 允许的状态：pending（正常审批）/ conflict（resolve=client 时以移动端为准）
 */
export function approveOp(opId: string, opts?: { allowConflict?: boolean }): ApproveResult {
  const db = getDb();
  const row = getOpRow(db, opId);
  if (!row) return { ok: false, error: "op 不存在", op_id: opId, applied: false };

  const allowed: string[] = opts?.allowConflict ? ["pending", "conflict"] : ["pending"];
  if (!allowed.includes(row.status)) {
    return {
      ok: false,
      error: `当前状态为 ${row.status}，仅 ${allowed.join("/")} 可执行此操作`,
      op_id: opId,
      applied: false,
    };
  }

  const op = rowToIncoming(row);

  // 1. 快照（事务前导出受影响条目；create 类无前置状态）
  const before = getItem(db, op.target_id);
  const snapshotPath = writeSnapshotFile(op, before);
  const beforeHash = before ? hashOf(before) : "";

  // 2-5. 应用 → 审计 → 状态 → version+1（同一事务）
  const tx = db.transaction((): { applied: boolean; reason?: string } => {
    const cur = getOpRow(db, opId);
    if (!cur || !allowed.includes(cur.status)) {
      throw new Error("op 状态在事务中发生变化，已回滚");
    }
    const result = applyChange(db, op);
    if (!result.ok) {
      db.prepare(
        "UPDATE pending_ops SET status = 'rejected', reject_reason = ? WHERE op_id = ?"
      ).run(result.reason ?? "应用失败", opId);
      return { applied: false, reason: result.reason };
    }
    const after = getItem(db, result.itemId!)!;
    const afterHash = hashOf(after);

    if (snapshotPath) {
      db.prepare(
        "INSERT INTO snapshots (id, created_at, path, reason, description) VALUES (?, ?, ?, 'pre_apply', ?)"
      ).run(uuid(), nowIso(), snapshotPath, `op ${opId} 应用前快照`);
    }

    db.prepare(
      "INSERT INTO applied_ops (op_id, applied_at, snapshot_path, before_hash, after_hash) VALUES (?, ?, ?, ?, ?)"
    ).run(opId, nowIso(), snapshotPath || "", beforeHash, afterHash);

    db.prepare("UPDATE pending_ops SET status = 'approved', reject_reason = NULL WHERE op_id = ?").run(opId);

    setDbVersionTx(db, getDbVersion(db) + 1);
    return { applied: true };
  });

  try {
    const outcome = tx();
    return {
      ok: true,
      op_id: opId,
      applied: outcome.applied,
      reject_reason: outcome.reason,
      snapshot_path: snapshotPath || undefined,
      db_version: getDbVersion(db),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      op_id: opId,
      applied: false,
    };
  }
}

/** 驳回：记原因；移动端草稿留在本地不自动重投 */
export function rejectOp(opId: string, reason?: string): ApproveResult {
  const db = getDb();
  const row = getOpRow(db, opId);
  if (!row) return { ok: false, error: "op 不存在", op_id: opId, applied: false };
  if (!["pending", "conflict"].includes(row.status)) {
    return { ok: false, error: `当前状态为 ${row.status}，不可驳回`, op_id: opId, applied: false };
  }
  db.prepare(
    "UPDATE pending_ops SET status = 'rejected', reject_reason = ? WHERE op_id = ?"
  ).run(reason?.trim() || "人工驳回", opId);
  return { ok: true, op_id: opId, applied: false };
}

/** 冲突解决：以主库为准（驳回客户端 op）或以移动端为准（强制应用） */
export function resolveConflict(opId: string, resolution: "server" | "client"): ApproveResult {
  const db = getDb();
  const row = getOpRow(db, opId);
  if (!row) return { ok: false, error: "op 不存在", op_id: opId, applied: false };
  if (row.status !== "conflict") {
    return { ok: false, error: `当前状态为 ${row.status}，仅 conflict 可解决`, op_id: opId, applied: false };
  }
  if (resolution === "server") {
    db.prepare(
      "UPDATE pending_ops SET status = 'rejected', reject_reason = '冲突处理：以主库为准' WHERE op_id = ?"
    ).run(opId);
    return { ok: true, op_id: opId, applied: false };
  }
  return approveOp(opId, { allowConflict: true });
}

/* ================= push（移动端投递） ================= */

export interface PushOpResult {
  op_id: string;
  status: "pending" | "duplicate" | "conflict" | "auto_applied";
  reject_reason?: string;
}

export function pushOps(deviceId: string, ops: IncomingOp[]): {
  results: PushOpResult[];
  snapshot_version: number;
} {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO pending_ops (op_id, device_id, type, target_id, item_type, payload, base_version, client_seq, status, reject_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const results: PushOpResult[] = [];

  for (const op of ops) {
    // 幂等：op_id 已存在 → duplicate，不重复应用
    if (getOpRow(db, op.op_id)) {
      results.push({ op_id: op.op_id, status: "duplicate" });
      continue;
    }

    const currentVersion = getDbVersion(db);
    const createClass = isCreateClass(op.type);

    // 冲突检测：非 create 类且 base_version 过期 → conflict（禁止自动合并）
    if (!createClass && op.base_version !== currentVersion) {
      insert.run(
        op.op_id,
        op.device_id,
        op.type,
        op.target_id,
        op.item_type,
        JSON.stringify(op.payload),
        op.base_version,
        op.client_seq ?? null,
        "conflict",
        "base_version 过期（主库已更新，需人工解决）",
        op.created_at || nowIso()
      );
      results.push({ op_id: op.op_id, status: "conflict" });
      continue;
    }

    // 正常落库 pending
    insert.run(
      op.op_id,
      op.device_id,
      op.type,
      op.target_id,
      op.item_type,
      JSON.stringify(op.payload),
      op.base_version,
      op.client_seq ?? null,
      "pending",
      null,
      op.created_at || nowIso()
    );

    // create 自动批准（可配置）；delete 永远人工批准
    if (createClass && getAutoApproveCreate()) {
      approveOp(op.op_id);
      results.push({ op_id: op.op_id, status: "auto_applied" });
      continue;
    }

    results.push({ op_id: op.op_id, status: "pending" });
  }

  return { results, snapshot_version: getDbVersion(db) };
}

/* ================= 查询（审批台 / 冲突列表） ================= */

export function listOps(status?: string): (PendingOpRow & { target_title: string | null; target_deleted: boolean | null })[] {
  const db = getDb();
  const rows = status
    ? db.prepare("SELECT * FROM pending_ops WHERE status = ? ORDER BY created_at").all(status)
    : db.prepare("SELECT * FROM pending_ops ORDER BY created_at DESC").all();
  return (rows as PendingOpRow[]).map((r) => {
    const item = getItem(db, r.target_id);
    return {
      ...r,
      payload: parseOpPayload(r) as never,
      target_title: item?.title ?? null,
      target_deleted: item ? Boolean(item.deleted_at) : null,
    };
  });
}

export function listConflicts(): unknown[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM pending_ops WHERE status = 'conflict' ORDER BY created_at")
    .all() as PendingOpRow[];
  return rows.map((r) => {
    const item = getItem(db, r.target_id);
    return {
      op_id: r.op_id,
      device_id: r.device_id,
      type: r.type,
      target_id: r.target_id,
      item_type: r.item_type,
      base_version: r.base_version,
      created_at: r.created_at,
      client_payload: parseOpPayload(r),
      reject_reason: r.reject_reason,
      server_item: item ?? null,
      server_version: getDbVersion(db),
    };
  });
}

/* ================= 快照下发（只读，排除软删除） ================= */

export function buildSnapshot(): {
  version: number;
  items: ItemRow[];
  profile: Record<string, unknown>;
  generated_at: string;
} {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC")
    .all() as ItemRow[];

  const profileRows = db
    .prepare("SELECT key, value FROM memory WHERE scope = 'profile'")
    .all() as { key: string; value: string }[];
  const profile: Record<string, unknown> = {};
  for (const r of profileRows) {
    try {
      profile[r.key] = JSON.parse(r.value);
    } catch {
      profile[r.key] = r.value;
    }
  }

  return { version: getDbVersion(db), items, profile, generated_at: nowIso() };
}
