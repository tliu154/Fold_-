/**
 * 审批闸门 · 变更提案（三期 C2）
 *
 * 干什么：AI / 定时任务为「未整理」目录里的新笔记生成变更提案 → 存起来 →
 * 站内消息通知 → 用户可以隔一阵再逐条编辑、批准或拒绝 → 批准后复用 B3 引擎执行。
 *
 * 硬约束（C2 已确认规格）：
 * - **不新增表**：复用 items 表 type='proposal'，payload 存完整结构；软删除复用 deleted_at
 * - **不重写执行引擎**：目录映射复用 A10 resolveExportDir、文件名复用 B3 safeName、
 *   执行复用 B3 runTidyItems（占用检测 / 目标同名保护 / 一次 commit / tidy-log 回滚记录）
 * - **AI 只补弱标签文件**：已有合规标签的沿用 B3 纯规则不调模型；一次调用批量返回整批建议
 * - AI 的标签建议**只用于推算目标目录**，绝不自动写进 frontmatter；
 *   是否真打标签仍由 libraries.json 的 tidy.tag 控制（默认关），全程不改正文
 * - 生成预览**不落库**；点「保存为提案并通知」才写入并发站内消息
 * - 同一文件只保留一条 pending 提案（去重）；批准前重新校验 stale
 * - 路径一律服务端重算并校验：from 必须在未整理目录内，dir 必须在 dirMap 允许集合内，
 *   越出测试知识库一律拒绝（真实库零接触）
 * - 模型不可用时**如实标注 ai_failed 并降级为纯规则提案**，不用 mock 假装成功
 *
 * 不做：周报模板、Qwen 资讯、多格式文件、OCR、邮件/系统通知、移动端。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { callStructured } from "./chat";
import { getLibraries, type TidyOptions } from "./libraries";
import { resolveExportDir } from "./capture";
import {
  previewTidy, getInboxDir, runTidyItems, safeName, isUnder,
  type TidyResult, type TidyItemInput,
} from "./tidy";
import { createMessage, type MessageKind } from "./messages";

export type ProposalStatus = "pending" | "approved" | "rejected" | "stale";

export interface ProposalItem {
  from: string;
  to: string;
  filename: string;
  dir: string;
  title: string;
  tags: string[];
  actions: string[];
  enabled: boolean;
  ai_suggested: boolean;
  reason?: string;
}

export interface ProposalPayload {
  status: ProposalStatus;
  title: string;
  source: string;
  ai_used: boolean;
  ai_failed: string | null;
  inbox: string;
  root: string;
  items: ProposalItem[];
  decided_at: string | null;
  commit: string | null;
  message: string | null;
}

export interface Proposal extends ProposalPayload {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalPreview {
  inbox: string;
  root: string;
  options: TidyOptions;
  counts: { candidates: number; weak: number; ai_applied: number };
  ai_used: boolean;
  ai_failed: string | null;
  items: ProposalItem[];
  generated_at: string;
}

interface ItemRow {
  id: string;
  payload: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const STRONG_PREFIXES = ["course/", "topic/", "source/", "type/"];
// callStructured 固定 max_tokens=1024，单次批量建议上限 10 条；超出的弱标签文件保持 B3 纯规则结果
const AI_LIMIT = 10;

function nowIso(): string { return new Date().toISOString(); }
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function dateStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function samePath(a: string, b: string): boolean {
  return path.resolve(a).replace(/\\/g, "/").toLowerCase() ===
    path.resolve(b).replace(/\\/g, "/").toLowerCase();
}
function allowedDirs(): Set<string> {
  const cfg = getLibraries();
  return new Set([...Object.values(cfg.dirMap), "笔记"]);
}
function normalizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = Array.from(new Set(v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().replace(/^#+/, "").replace(/^["']|["']$/g, "").trim())
    .filter((x) => x.length > 0 && x.length <= 60 && !/[\r\n\\]/.test(x))
  )).slice(0, 8);
  // 至少要有一个合规层级前缀，否则目录映射会全部回落，视为无效建议
  return out.some((t) => STRONG_PREFIXES.some((p) => t.startsWith(p))) ? out : [];
}
function isWeak(tags: string[]): boolean {
  return !tags.some((t) => STRONG_PREFIXES.some((p) => t.startsWith(p)));
}

function rowToProposal(row: ItemRow): Proposal | null {
  try {
    const p = JSON.parse(row.payload || "{}") as Partial<ProposalPayload>;
    if (typeof p.title !== "string" || !Array.isArray(p.items)) return null;
    return {
      id: row.id,
      status: (["pending", "approved", "rejected", "stale"] as ProposalStatus[]).includes(p.status as ProposalStatus)
        ? p.status as ProposalStatus : "pending",
      title: p.title,
      source: typeof p.source === "string" ? p.source : "",
      ai_used: p.ai_used === true,
      ai_failed: typeof p.ai_failed === "string" ? p.ai_failed : null,
      inbox: typeof p.inbox === "string" ? p.inbox : "",
      root: typeof p.root === "string" ? p.root : "",
      items: p.items as ProposalItem[],
      decided_at: typeof p.decided_at === "string" ? p.decided_at : null,
      commit: typeof p.commit === "string" ? p.commit : null,
      message: typeof p.message === "string" ? p.message : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch { return null; }
}

/* ---------------- 服务端重算条目（防前端伪造路径） ---------------- */

interface RawItem {
  from: unknown; dir: unknown; filename: unknown; title: unknown;
  tags: unknown; enabled?: unknown; ai_suggested?: unknown;
}

/**
 * 把客户端传来的条目归一化：
 * - from 必须在未整理目录内且是 .md（越界直接抛错）
 * - dir 必须在 dirMap 允许集合内（防 ../ 穿越）
 * - to 由 root + dir + filename 服务端重算，不信任客户端的 to
 */
function normalizeItems(raw: RawItem[], root: string, inbox: string): ProposalItem[] {
  const dirs = allowedDirs();
  const cfg = getLibraries();
  const options = cfg.tidy;
  return raw.map((r) => {
    if (typeof r.from !== "string" || !r.from.trim()) throw new Error("条目缺少原文件路径");
    const from = path.resolve(r.from);
    if (!isUnder(from, inbox)) throw new Error(`提案文件不在未整理目录内：${from}`);
    if (path.extname(from).toLowerCase() !== ".md") throw new Error(`提案只处理 .md：${path.basename(from)}`);
    const base = path.basename(from);

    const dir = typeof r.dir === "string" && dirs.has(r.dir) ? r.dir : "笔记";
    const title = (typeof r.title === "string" && r.title.trim() ? r.title.trim() : base.replace(/\.md$/i, "")).slice(0, 60);
    const tags = normalizeTags(r.tags);
    const filename = typeof r.filename === "string" && r.filename.trim()
      ? safeName(r.filename.replace(/\.md$/i, "")) + ".md"
      : `${dateStr()}_${safeName(title)}.md`;
    // 保留 B3 的日期前缀：若客户端带的是合法 YYYY-MM-DD_标题.md 就沿用
    const finalName = /^\d{4}-\d{2}-\d{2}_/.test(filename) ? filename : `${dateStr()}_${filename}`;

    const targetDirAbs = options.move ? path.join(root, dir) : path.dirname(from);
    const to = path.join(targetDirAbs, finalName);
    const actions: string[] = [];
    if (options.move && !samePath(targetDirAbs, path.dirname(from))) actions.push("移动");
    if (options.rename && finalName !== base) actions.push("重命名");
    if (options.tag && !tags.some((t) => t.startsWith("type/"))) actions.push("打标签");

    return {
      from, to, filename: finalName, dir, title, tags, actions,
      enabled: r.enabled !== false,
      ai_suggested: r.ai_suggested === true,
    } satisfies ProposalItem;
  });
}

/* ---------------- 生成预览（不落库） ---------------- */

interface AiRaw {
  suggestions?: { file?: unknown; tags?: unknown; title?: unknown }[];
}

/**
 * 生成提案预览：先用 B3 规则算出全部候选，再对「弱标签」文件做**一次**批量 AI 调用补建议。
 * 纯读 + 调模型，不写任何文件、不落库、不 init git。
 */
export async function generateProposalPreview(): Promise<ProposalPreview> {
  const preview = previewTidy();          // 复用 B3：扫描 / 元数据 / 目录映射 / 日期文件名
  const cfg = getLibraries();
  const options = cfg.tidy;
  const root = preview.root;
  const inbox = preview.inbox;
  const generated_at = nowIso();

  interface Candidate {
    from: string; base: string; title: string; tags: string[];
    datePrefix: string; weak: boolean; ai: boolean;
  }
  const candidates: Candidate[] = preview.items
    .filter((i) => path.extname(i.from).toLowerCase() === ".md" && i.actions.length > 0)
    .slice(0, 200)
    .map((i) => ({
      from: i.from,
      base: path.basename(i.from),
      title: i.title,
      tags: i.tags.slice(),
      datePrefix: i.filename.match(/^(\d{4}-\d{2}-\d{2})_/)?.[1] ?? dateStr(),
      weak: isWeak(i.tags),
      ai: false,
    }));

  const weak = candidates.filter((c) => c.weak);
  let ai_used = false;
  let ai_failed: string | null = null;
  let ai_applied = 0;

  if (weak.length > 0) {
    const dirList = [...allowedDirs()].join(" / ");
    const fileList = weak.slice(0, AI_LIMIT)
      .map((c, i) => `${i + 1}. ${c.base}｜标题：${c.title}｜现有标签：${c.tags.join(", ") || "无"}`)
      .join("\n");
    try {
      const raw = await callStructured<AiRaw>([
        {
          role: "system",
          content: "你是知识库整理助手。下面列出「未整理」目录里缺少有效标签的笔记，"
            + "只有文件名/标题/现有标签，没有正文。请为每条给出建议，只输出 JSON 对象："
            + '{"suggestions":[{"file":"原文件名(必须与输入完全一致)","tags":["course/微积分","type/笔记"],'
            + '"title":"规范标题"}]}。\n'
            + "标签规则：层级 英文/中文，一律小写、不含空格，前缀只能是 course/ topic/ source/ type/ 之一；"
            + "每条至少给一个带前缀的标签。title 用于生成文件名，简短即可，不要带扩展名。\n"
            + `可选目标目录：${dirList}（网站会按标签自动映射，你不需要给目录）。\n`
            + "不确定就按文件名猜一个合理分类，不要输出 JSON 以外的任何文字。",
        },
        { role: "user", content: `待建议的文件（共 ${Math.min(weak.length, AI_LIMIT)} 个）：\n${fileList}` },
      ]);
      const list = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
      for (const s of list) {
        if (typeof s?.file !== "string") continue;
        const c = weak.find((x) => x.base === s.file);
        if (!c) continue;                       // 只接受本次候选里的文件，忽略幻觉文件名
        const tags = normalizeTags(s.tags);
        if (tags.length === 0) continue;         // 无效建议不采用
        c.tags = tags;
        if (typeof s.title === "string" && s.title.trim()) c.title = s.title.trim().slice(0, 60);
        c.ai = true;
        ai_applied++;
      }
      ai_used = ai_applied > 0;
    } catch (e) {
      // 如实标注并降级为 B3 纯规则提案，不重试、不假装成功
      ai_failed = (e as Error).message || "模型调用失败";
    }
  }

  const items: ProposalItem[] = [];
  for (const c of candidates) {
    const dir = resolveExportDir(c.tags, cfg.dirMap);   // 标签建议只用来推算目标目录
    const filename = options.rename ? `${c.datePrefix}_${safeName(c.title)}.md` : c.base;
    const targetDirAbs = options.move ? path.join(root, dir) : path.dirname(c.from);
    const to = path.join(targetDirAbs, filename);
    const actions: string[] = [];
    if (options.move && !samePath(targetDirAbs, path.dirname(c.from))) actions.push("移动");
    if (options.rename && filename !== c.base) actions.push("重命名");
    if (options.tag && !c.tags.some((t) => t.startsWith("type/"))) actions.push("打标签");
    if (actions.length === 0) continue;               // 重算后无需变更的不进提案
    items.push({
      from: c.from, to, filename, dir, title: c.title, tags: c.tags, actions,
      enabled: true, ai_suggested: c.ai,
    });
  }

  return {
    inbox, root, options,
    counts: { candidates: candidates.length, weak: weak.length, ai_applied },
    ai_used, ai_failed, items, generated_at,
  };
}

/* ---------------- 落库 / 列表 / 编辑 / 批准 ---------------- */

function insert(payload: ProposalPayload, source: string): Proposal {
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'proposal', '', '', ?, 1, ?, ?)`
  ).run(id, JSON.stringify({ ...payload, source }), now, now);
  return getProposal(id)!;
}

export function listProposals(status?: ProposalStatus, includeDeleted = false): Proposal[] {
  const db = getDb();
  const sql = includeDeleted
    ? "SELECT * FROM items WHERE type = 'proposal' ORDER BY created_at DESC LIMIT 200"
    : "SELECT * FROM items WHERE type = 'proposal' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200";
  const rows = db.prepare(sql).all() as ItemRow[];
  const out = rows.map(rowToProposal).filter((p): p is Proposal => p !== null);
  return status ? out.filter((p) => p.status === status) : out;
}

export function getProposal(id: string): Proposal | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM items WHERE id = ? AND type = 'proposal' AND deleted_at IS NULL"
  ).get(id) as ItemRow | undefined;
  return row ? rowToProposal(row) : null;
}

export function pendingCount(): number {
  return listProposals("pending").length;
}

function pendingFiles(): Set<string> {
  const s = new Set<string>();
  for (const p of listProposals("pending")) {
    for (const it of p.items) s.add(path.resolve(it.from));
  }
  return s;
}

function save(id: string, patch: Partial<ProposalPayload>): Proposal | null {
  const cur = getProposal(id);
  if (!cur) return null;
  const db = getDb();
  const next: ProposalPayload = {
    status: patch.status ?? cur.status,
    title: patch.title ?? cur.title,
    source: patch.source ?? cur.source,
    ai_used: patch.ai_used ?? cur.ai_used,
    ai_failed: patch.ai_failed !== undefined ? patch.ai_failed : cur.ai_failed,
    inbox: patch.inbox ?? cur.inbox,
    root: patch.root ?? cur.root,
    items: patch.items ?? cur.items,
    decided_at: patch.decided_at !== undefined ? patch.decided_at : cur.decided_at,
    commit: patch.commit !== undefined ? patch.commit : cur.commit,
    message: patch.message !== undefined ? patch.message : cur.message,
  };
  db.prepare(
    "UPDATE items SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND type = 'proposal'"
  ).run(JSON.stringify(next), nowIso(), id);
  return getProposal(id);
}

export interface SaveProposalInput {
  items: RawItem[];
  ai_used?: boolean;
  ai_failed?: string | null;
  source?: string;
}

/**
 * 保存预览为正式提案（点「保存为提案并通知」才调用）：
 * 服务端重算路径 → 与已有 pending 提案去重 → 落库 → 发一条 kind=proposal 站内消息。
 * 去重后没有新条目时返回 null（不创建、不发消息）。
 */
export function saveProposal(input: SaveProposalInput): Proposal | null {
  const preview = previewTidy();
  const root = preview.root;
  const inbox = getInboxDir();
  const items = normalizeItems(input.items ?? [], root, inbox)
    .filter((i) => i.actions.length > 0);
  if (items.length === 0) throw new Error("没有可整理的条目，无需生成提案");

  const busy = pendingFiles();
  const fresh = items.filter((i) => !busy.has(path.resolve(i.from)));
  if (fresh.length === 0) return null;            // 全部已有 pending 提案，不重复通知

  const source = input.source || `manual:proposal:${Date.now()}`;
  const payload: ProposalPayload = {
    status: "pending",
    title: `整理提案 · ${dateStr()}（${fresh.length} 个文件）`,
    source,
    ai_used: input.ai_used === true,
    ai_failed: typeof input.ai_failed === "string" ? input.ai_failed : null,
    inbox, root, items: fresh,
    decided_at: null, commit: null, message: null,
  };
  const proposal = insert(payload, source);

  const lines = fresh.slice(0, 8).map((i) =>
    `  · ${path.basename(i.from)} → ${i.dir}/${i.filename}${i.ai_suggested ? "（AI 建议）" : "（规则）"}`
  );
  const body = [
    `【待审批整理提案】共 ${fresh.length} 个文件，等待你批准后才会动文件。`,
    ...lines,
    ...(fresh.length > 8 ? [`  · …还有 ${fresh.length - 8} 个`] : []),
    "",
    payload.ai_failed ? `注：AI 建议未生效（${payload.ai_failed}），本次为纯规则提案。` : "",
    "请到「站内消息 → 待审批提案」逐条查看、修改或批准后执行；网站不会自动整理。",
  ].filter(Boolean).join("\n");
  createMessage({
    kind: "proposal" as MessageKind,
    title: `待审批：整理提案（${fresh.length} 个文件）`,
    body,
    source: `proposal:${proposal.id}`,
  });
  return proposal;
}

export interface ProposalPatch {
  items?: RawItem[];
  status?: "rejected" | "stale";
}

/** 逐条编辑（勾选 / 改目录与文件名 / 标题 / 标签）或驳回；路径一律服务端重算 */
export function updateProposal(id: string, patch: ProposalPatch): Proposal | null {
  const cur = getProposal(id);
  if (!cur) return null;
  if (cur.status !== "pending") throw new Error("只有待审批提案可以修改或驳回");
  if (patch.status === "rejected") {
    return save(id, { status: "rejected", decided_at: nowIso() });
  }
  if (patch.status === "stale") {
    return save(id, { status: "stale", decided_at: nowIso() });
  }
  if (patch.items) {
    const items = normalizeItems(patch.items, cur.root, cur.inbox);
    return save(id, { items });
  }
  return cur;
}

/** 批准后执行：复用 B3 的按条目执行入口，一次批准 = 一次 git commit */
export function approveProposal(id: string): { proposal: Proposal; result: TidyResult } {
  const cur = getProposal(id);
  if (!cur) throw new Error("提案不存在");
  if (cur.status !== "pending") throw new Error("该提案已处理，不能重复批准");
  const enabled = cur.items.filter((i) => i.enabled);
  if (enabled.length === 0) throw new Error("没有勾选任何条目，无需执行");

  // 执行前重新校验：原文件已不在 → 标记 stale 跳过，不硬来
  const stale = new Set(enabled.filter((i) => !fs.existsSync(i.from)).map((i) => i.from));
  const inputs: TidyItemInput[] = enabled.map((i) => ({
    from: i.from, to: i.to, filename: i.filename, dir: i.dir,
    title: i.title, tags: i.tags, actions: i.actions,
    enabled: !stale.has(i.from),
  }));
  const message = `审批提案 ${dateStr()}（${enabled.length} 个文件）`;
  const result = runTidyItems(inputs, message);

  const skippedByPath = new Map(result.skipped.map((s) => [path.resolve(s.path), s.reason]));
  const moved = new Set(result.moved.map((m) => path.resolve(m.from)));
  const items = cur.items.map((i) => {
    const abs = path.resolve(i.from);
    if (skippedByPath.has(abs)) return { ...i, reason: skippedByPath.get(abs) };
    if (stale.has(abs)) return { ...i, reason: "原文件已不存在（可能已被整理或移走）" };
    if (moved.has(abs)) return { ...i, enabled: false };
    return i;
  });
  const proposal = save(id, {
    status: "approved", decided_at: nowIso(), commit: result.commit,
    message: result.message, items,
  })!;
  return { proposal, result };
}

export function softDeleteProposal(id: string): boolean {
  const db = getDb();
  if (!getProposal(id)) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'proposal'")
    .run(nowIso(), nowIso(), id);
  return true;
}

/** 验收收尾：彻底清掉测试产生的提案（含已软删），避免污染主库 */
export function purgeProposalsBySourcePrefix(prefix: string): number {
  const db = getDb();
  const rows = db.prepare("SELECT id, payload FROM items WHERE type = 'proposal'").all() as
    { id: string; payload: string | null }[];
  const ids = rows.filter((r) => {
    try { return String((JSON.parse(r.payload || "{}") as { source?: string }).source ?? "").startsWith(prefix); }
    catch { return false; }
  }).map((r) => r.id);
  if (ids.length) {
    db.prepare(`DELETE FROM items WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  }
  return ids.length;
}
