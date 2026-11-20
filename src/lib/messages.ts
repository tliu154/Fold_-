/**
 * 站内消息（三期 C1）
 *
 * 干什么：定时任务、错过盘点、后续周报/审批闸门都把「汇报」投递到这里，
 * 不做邮件 / 微信 / 浏览器系统通知（清单要求汇报走站内消息）。
 *
 * 存储：**不新增表**，复用 items 表 type='message'。
 * - title / content 列留空，完整结构放 payload = { kind, title, body, read, source }
 *   （按 C1 已确认规格，单一数据源，避免双写不一致）
 * - 软删除复用 deleted_at；已读是 payload.read（不新增列）
 * - source 用作业内去重键：cron:<job>:<日期> / manual:<job>:<时间戳> / missed:<日期>
 *
 * 不做：优先级、归档、附件、消息正文渲染 HTML、推送到站外。
 */
import crypto from "node:crypto";
import { getDb } from "./db";

export type MessageKind = "daily_focus" | "inbox_scan" | "weekly_digest" | "missed" | "system" | "proposal";

export interface MessagePayload {
  kind: MessageKind;
  title: string;
  body: string;
  read: boolean;
  source: string;
}

export interface Message {
  id: string;
  kind: MessageKind;
  title: string;
  body: string;
  read: boolean;
  source: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  payload: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function nowIso(): string { return new Date().toISOString(); }

const KINDS: MessageKind[] = ["daily_focus", "inbox_scan", "weekly_digest", "missed", "system", "proposal"];

function parsePayload(raw: string | null): MessagePayload | null {
  try {
    const p = JSON.parse(raw || "{}") as Partial<MessagePayload>;
    if (typeof p.title !== "string" || typeof p.body !== "string") return null;
    return {
      kind: KINDS.includes(p.kind as MessageKind) ? (p.kind as MessageKind) : "system",
      title: p.title,
      body: p.body,
      read: p.read === true,
      source: typeof p.source === "string" ? p.source : "",
    };
  } catch { return null; }
}

function rowToMessage(row: ItemRow): Message | null {
  const p = parsePayload(row.payload);
  if (!p) return null;
  return {
    id: row.id, kind: p.kind, title: p.title, body: p.body,
    read: p.read, source: p.source,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

/** 列表：默认排除软删除；filter=unread 只看未读 */
export function listMessages(
  filter: "all" | "unread" = "all",
  opts: { includeDeleted?: boolean; limit?: number } = {}
): Message[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const sql = opts.includeDeleted
    ? "SELECT * FROM items WHERE type = 'message' ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM items WHERE type = 'message' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?";
  const rows = db.prepare(sql).all(limit) as ItemRow[];
  const out = rows.map(rowToMessage).filter((m): m is Message => m !== null);
  return filter === "unread" ? out.filter((m) => !m.read) : out;
}

export function unreadCount(): number {
  const db = getDb();
  const rows = db.prepare(
    "SELECT payload FROM items WHERE type = 'message' AND deleted_at IS NULL"
  ).all() as { payload: string | null }[];
  return rows.filter((r) => {
    const p = parsePayload(r.payload);
    return p !== null && !p.read;
  }).length;
}

export function getMessage(id: string): Message | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'message' AND deleted_at IS NULL").get(id) as
    | ItemRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function findBySource(source: string): Message | null {
  return listMessages("all").find((m) => m.source === source) ?? null;
}

export interface CreateMessageInput {
  kind: MessageKind;
  title: string;
  body: string;
  source: string;
}

/** 新建消息。dedupe=true 时同一 source 已存在则直接返回旧消息（不刷屏） */
export function createMessage(input: CreateMessageInput, dedupe = false): Message {
  if (dedupe) {
    const old = findBySource(input.source);
    if (old) return old;
  }
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const payload: MessagePayload = {
    kind: input.kind, title: input.title, body: input.body, read: false, source: input.source,
  };
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'message', '', '', ?, 1, ?, ?)`
  ).run(id, JSON.stringify(payload), now, now);
  return getMessage(id)!;
}

/** 更新已有消息内容（错过汇总按 source 复用同一条时累加次数用） */
export function updateMessageBody(id: string, body: string): Message | null {
  const cur = getMessage(id);
  if (!cur) return null;
  const db = getDb();
  const payload: MessagePayload = {
    kind: cur.kind, title: cur.title, body, read: false, source: cur.source,
  };
  db.prepare(
    "UPDATE items SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND type = 'message'"
  ).run(JSON.stringify(payload), nowIso(), id);
  return getMessage(id);
}

export function markRead(id: string, read = true): Message | null {
  const cur = getMessage(id);
  if (!cur) return null;
  const db = getDb();
  const payload: MessagePayload = {
    kind: cur.kind, title: cur.title, body: cur.body, read, source: cur.source,
  };
  db.prepare("UPDATE items SET payload = ?, updated_at = ? WHERE id = ? AND type = 'message'")
    .run(JSON.stringify(payload), nowIso(), id);
  return getMessage(id);
}

export function markAllRead(): number {
  const db = getDb();
  let n = 0;
  for (const m of listMessages("unread", { limit: 500 })) {
    if (markRead(m.id)) n++;
  }
  return n;
}

export function softDeleteMessage(id: string): boolean {
  const db = getDb();
  if (!getMessage(id)) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'message'")
    .run(nowIso(), nowIso(), id);
  return true;
}
