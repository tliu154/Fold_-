/**
 * 「记下来」（一期 A10，收窄版）
 * - 入口：AI 对话 / 管家页，按轮次勾选（一问一答为单位），点一下、不打字
 * - 存：一次点击 = 一条 items 记录 type=note，content 按序拼接勾选问答
 * - payload: { tags, source:"网页AI", session_id, status:"pending"|"done", save_batch_id, message_ids }
 * - 幂等：同一 session + 同一批 message_ids 组合已存过则拒绝；存后回填 ai_messages.saved_as_item_id
 * - AI：点记下来时调一次 callStructured 生成推荐标题 + 标签建议（不猜错可手改）
 * - 手动整理：改标题/标签 → 状态转 done
 * - 导出：预览后确认，按标签映射写 .md 到知识库（默认测试库 D:\我的知识库测试）
 * - 绝不自动/批量存；不新增表
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db";
import { getDataDir } from "./config";
import { callStructured } from "./chat";
import { listMessages, getSession } from "./chat";

export const SOURCE_TAG = "source/网页AI";
export const TYPE_TAG = "type/笔记";
export const DEFAULT_VAULT = "D:\\我的知识库测试";

export interface CapturedItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  session_id: string;
  status: "pending" | "done";
  save_batch_id: string;
  message_ids: string[];
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  payload: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface Payload {
  tags: string[];
  source: string;
  session_id: string;
  status: "pending" | "done";
  save_batch_id: string;
  message_ids: string[];
}

function nowIso(): string { return new Date().toISOString(); }
function batchKey(sessionId: string, ids: string[]): string {
  return `session:${sessionId}|ids:${[...ids].sort().join(",")}`;
}

function rowToCaptured(r: ItemRow): CapturedItem {
  const p = JSON.parse(r.payload) as Payload;
  return {
    id: r.id,
    title: r.title ?? "",
    content: r.content ?? "",
    tags: p.tags ?? [],
    session_id: p.session_id ?? "",
    status: p.status ?? "pending",
    save_batch_id: p.save_batch_id ?? "",
    message_ids: p.message_ids ?? [],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** 读配置：知识库根目录 + 导出目录映射规则 */
export interface CaptureConfig {
  vault: string;
  dirMap: Record<string, string>; // 标签前缀 → 子目录
}
export function getCaptureConfig(): CaptureConfig {
  const p = path.join(getDataDir(), "capture-config.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<CaptureConfig>;
    if (typeof parsed.vault === "string") {
      return {
        vault: parsed.vault,
        dirMap: parsed.dirMap && typeof parsed.dirMap === "object" ? parsed.dirMap : defaultDirMap(),
      };
    }
  } catch { /* 默认 */ }
  return { vault: DEFAULT_VAULT, dirMap: defaultDirMap() };
}
export function setCaptureConfig(cfg: CaptureConfig): CaptureConfig {
  const p = path.join(getDataDir(), "capture-config.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return cfg;
}
function defaultDirMap(): Record<string, string> {
  return {
    "course/": "课件和教材",
    "topic/": "笔记",
    "source/": "资源库",
    "type/": "笔记",
  };
}

/** 按轮次取勾选的问答组合（ids 为每轮的 user message id） */
export function buildDialogue(sessionId: string, messageIds: string[]): {
  text: string;
  realMessageIds: string[];
} | null {
  if (!getSession(sessionId)) return null;
  const msgs = listMessages(sessionId);
  const picked: number[] = [];
  for (const id of messageIds) {
    const idx = msgs.findIndex((m) => m.id === id && m.role === "user");
    if (idx === -1) return null;
    picked.push(idx);
    if (msgs[idx + 1]?.role === "assistant") picked.push(idx + 1);
  }
  picked.sort((a, b) => a - b);
  const lines: string[] = [];
  const realIds: string[] = [];
  for (const i of picked) {
    const m = msgs[i];
    lines.push(`【${m.role === "user" ? "我" : "AI"}】\n${m.content}`);
    realIds.push(m.id);
  }
  return { text: lines.join("\n\n"), realMessageIds: realIds };
}

export interface AiSuggestion {
  title: string;
  tags: string[];
}

/** 调一次模型生成推荐标题与标签（本期不猜 topic 目录） */
export async function suggestMeta(dialogue: string): Promise<AiSuggestion> {
  const raw = await callStructured<{ title?: string; tags?: string[] }>([
    {
      role: "system",
      content: "你是笔记整理助手。根据对话内容输出 JSON：{\"title\":\"≤30字的中文标题\",\"tags\":[\"topic/xxx\",\"course/xxx\"]}。tag 用用户标签规范 topic/course，最多3个，不要加 type/ 或 source/ 标签。",
    },
    { role: "user", content: dialogue.slice(0, 4000) },
  ]);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === "string" && /^(topic|course)\//.test(t)).slice(0, 3)
    : [];
  return { title: (raw.title ?? "未命名记录").trim().slice(0, 60), tags };
}

/** 幂等检查：同会话 + 同批 user 消息 id */
export function alreadyCaptured(sessionId: string, userIds: string[]): CapturedItem | null {
  const key = batchKey(sessionId, userIds);
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM items WHERE type = 'note' AND deleted_at IS NULL")
    .all() as ItemRow[];
  for (const r of rows) {
    const p = JSON.parse(r.payload) as Partial<Payload>;
    if (p.session_id === sessionId && batchKey(sessionId, p.message_ids ?? []) === key) {
      return rowToCaptured(r);
    }
  }
  return null;
}

export interface SaveInput {
  session_id: string;
  message_ids: string[]; // 勾选的 user 消息 id
  title?: string;
  tags?: string[];
  suggestion?: AiSuggestion;
}

/** 保存一条「记下来」（一次点击）并回填 saved_as_item_id */
export function saveCapture(input: SaveInput): CapturedItem {
  const built = buildDialogue(input.session_id, input.message_ids);
  if (!built) throw new Error("会话或勾选的消息不存在");
  const dup = alreadyCaptured(input.session_id, input.message_ids);
  if (dup) throw new Error("这批对话已记下来过，不重复保存");

  const db = getDb();
  const id = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const now = nowIso();
  const tags = Array.from(new Set([
    TYPE_TAG, SOURCE_TAG,
    ...(input.tags ?? input.suggestion?.tags ?? []),
  ]));
  const title = (input.title ?? input.suggestion?.title ?? "未命名记录").trim().slice(0, 200);
  const payload: Payload = {
    tags, source: "网页AI", session_id: input.session_id,
    status: "pending", save_batch_id: batchId,
    message_ids: input.message_ids,
  };
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
       VALUES (?, 'note', ?, ?, ?, 1, ?, ?)`
    ).run(id, title, built.text, JSON.stringify(payload), now, now);
    // 回填：仅尚未被其它记录引用的消息
    for (const mid of built.realMessageIds) {
      db.prepare(
        "UPDATE ai_messages SET saved_as_item_id = ? WHERE id = ? AND (saved_as_item_id IS NULL OR saved_as_item_id = '')"
      ).run(id, mid);
    }
  });
  tx();
  return rowToCaptured(db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow);
}

/** 列出某会话的「记下来」记录（按时间倒序） */
export function listCaptures(sessionId: string): CapturedItem[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM items WHERE type = 'note' AND deleted_at IS NULL")
    .all() as ItemRow[];
  return rows
    .filter((r) => (JSON.parse(r.payload) as Partial<Payload>).session_id === sessionId)
    .map(rowToCaptured)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getCapture(id: string): CapturedItem | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'note' AND deleted_at IS NULL").get(id) as
    | ItemRow | undefined;
  return r ? rowToCaptured(r) : null;
}

/** 手动整理：改标题/标签 → 状态转 done */
export function organizeCapture(id: string, patch: { title?: string; tags?: string[] }): CapturedItem | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'note' AND deleted_at IS NULL").get(id) as
    | ItemRow | undefined;
  if (!r) return null;
  const p = JSON.parse(r.payload) as Payload;
  const tags = patch.tags
    ? Array.from(new Set([TYPE_TAG, SOURCE_TAG, ...patch.tags]))
    : p.tags;
  const nextPayload: Payload = { ...p, tags, status: "done" };
  db.prepare("UPDATE items SET title = ?, payload = ?, updated_at = ? WHERE id = ?")
    .run(patch.title?.trim().slice(0, 200) || r.title, JSON.stringify(nextPayload), nowIso(), id);
  return getCapture(id);
}

export function deleteCapture(id: string): boolean {
  const db = getDb();
  return db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'note'")
    .run(nowIso(), nowIso(), id).changes > 0;
}

/** 根据标签推导导出子目录 */
export function resolveExportDir(tags: string[], dirMap: Record<string, string>): string {
  // 按前缀 specificity 排序：course/ > topic/ > source/ > type/，
  // 避免固定的 type/笔记 抢先命中把 course/ 笔记也塞进「笔记」目录
  const priority = (p: string) => {
    if (p.startsWith("course/")) return 0;
    if (p.startsWith("topic/")) return 1;
    if (p.startsWith("source/")) return 2;
    if (p.startsWith("type/")) return 3;
    return 4;
  };
  const entries = Object.entries(dirMap).sort((a, b) => priority(a[0]) - priority(b[0]));
  for (const [prefix, dir] of entries) {
    if (tags.some((t) => t.startsWith(prefix))) return dir;
  }
  return "笔记";
}

/** 导出预览：文件名 / 目标绝对路径 / 带 frontmatter 的 .md 正文 */
export interface ExportPreview {
  filename: string;
  target: string;
  content: string;
  vault: string;
  dir: string;
}
export function previewExport(item: CapturedItem, overrideDir?: string): ExportPreview {
  const cfg = getCaptureConfig();
  const dir = overrideDir ?? resolveExportDir(item.tags, cfg.dirMap);
  // 文件名时间戳 YYYYMMDD_HHMM（本地时间），避免 slice 截出半截分钟
  const d = new Date(item.created_at);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = item.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "未命名";
  const filename = `${stamp}_${safe}.md`;
  const target = path.join(cfg.vault, dir, filename);
  const tagLines = item.tags.map((t) => `  - "#${t}"`).join("\n");
  const content = [
    "---",
    `title: "${item.title.replace(/"/g, "'")}"`,
    `created: ${item.created_at.slice(0, 10)}`,
    "tags:",
    tagLines,
    `source_session: "${item.session_id}"`,
    "---",
    "",
    `# ${item.title}`,
    "",
    item.content,
    "",
  ].join("\n");
  return { filename, target, content, vault: cfg.vault, dir };
}

/** 真正写 .md（仅在用户预览确认后调用） */
export function writeExport(item: CapturedItem, overrideDir?: string): ExportPreview {
  const preview = previewExport(item, overrideDir);
  const target = path.resolve(preview.target);
  const vault = path.resolve(getCaptureConfig().vault);
  if (!target.startsWith(vault + path.sep)) {
    throw new Error("目标路径必须在配置的知识库目录内");
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) throw new Error("同名文件已存在，不覆盖");
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, preview.content, "utf-8");
  fs.renameSync(tmp, target);
  return preview;
}
