/**
 * AI 对话基础（一期 A6）
 * - 两种模式：临时模式(Stateless、不落库) / 普通模式(保留最近 10 轮上下文、落库)
 * - 多个独立会话：会话壳存 memory 表 scope='chat_session'（不新增表），消息存 ai_messages(session_id)
 * - 会话标题：默认由首条用户消息前 20 字派生；重命名后以覆盖值为准
 * - 清空 = 清空该会话消息但保留会话壳
 * - 模型：DeepSeek-Flash，OpenAI 兼容 chat/completions，一次性返回（不做 SSE）
 * - 结构化输出：本期只预留 callStructured 能力，不落地调用（分类/提案属后续功能）
 * - 不做：ai_usage 记账 / 月度预算 / AI 专用限流（v0.6 未要求）
 */
import crypto from "node:crypto";
import { getDb } from "./db";
import { getDailyModel } from "./config";

const SESSION_SCOPE = "chat_session";
const CONTEXT_ROUNDS = 10; // 最近 10 轮 = 20 条消息
const TITLE_LEN = 20;

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface SessionMeta {
  created_at: string;
  title_override: string | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string | null;
  saved_as_item_id: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}
function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > TITLE_LEN ? `${t.slice(0, TITLE_LEN)}…` : t || "新对话";
}

/* ---------- 会话壳（memory 表） ---------- */

function allSessionMeta(): Map<string, SessionMeta> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM memory WHERE scope = ?")
    .all(SESSION_SCOPE) as { key: string; value: string }[];
  const map = new Map<string, SessionMeta>();
  for (const r of rows) {
    try {
      const v = JSON.parse(r.value) as Partial<SessionMeta>;
      map.set(r.key, {
        created_at: typeof v.created_at === "string" ? v.created_at : nowIso(),
        title_override: typeof v.title_override === "string" ? v.title_override : null,
      });
    } catch { /* 忽略损坏记录 */ }
  }
  return map;
}

function writeSessionMeta(db: ReturnType<typeof getDb>, id: string, meta: SessionMeta): void {
  db.prepare(
    `INSERT INTO memory (scope, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SESSION_SCOPE, id, JSON.stringify(meta), nowIso());
}

export function listSessions(): ChatSession[] {
  const db = getDb();
  const metas = allSessionMeta();
  const counts = db
    .prepare("SELECT session_id, COUNT(*) n FROM ai_messages GROUP BY session_id")
    .all() as { session_id: string; n: number }[];
  const countMap = new Map(counts.map((c) => [c.session_id, c.n]));
  const firstMsgs = db
    .prepare("SELECT session_id, content, created_at FROM ai_messages WHERE role = 'user' ORDER BY created_at")
    .all() as { session_id: string; content: string | null; created_at: string }[];
  const firstMap = new Map<string, string>();
  for (const m of firstMsgs) if (!firstMap.has(m.session_id)) firstMap.set(m.session_id, m.content ?? "");
  const updated = db
    .prepare("SELECT session_id, MAX(created_at) t FROM ai_messages GROUP BY session_id")
    .all() as { session_id: string; t: string }[];
  const updatedMap = new Map(updated.map((u) => [u.session_id, u.t]));

  return [...metas.entries()]
    .map(([id, meta]) => ({
      id,
      title: meta.title_override ?? deriveTitle(firstMap.get(id) ?? "") ,
      created_at: meta.created_at,
      updated_at: updatedMap.get(id) ?? meta.created_at,
      message_count: countMap.get(id) ?? 0,
    }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function createSession(): ChatSession {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  writeSessionMeta(db, id, { created_at: now, title_override: null });
  return { id, title: "新对话", created_at: now, updated_at: now, message_count: 0 };
}

export function getSession(id: string): ChatSession | null {
  const meta = allSessionMeta().get(id);
  if (!meta) return null;
  return listSessions().find((s) => s.id === id) ?? null;
}

export function renameSession(id: string, title: string): ChatSession | null {
  const db = getDb();
  const meta = allSessionMeta().get(id);
  if (!meta) return null;
  writeSessionMeta(db, id, { ...meta, title_override: title.trim().slice(0, 100) || null });
  return getSession(id);
}

export function deleteSession(id: string): boolean {
  const db = getDb();
  if (!allSessionMeta().has(id)) return false;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM ai_messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM memory WHERE scope = ? AND key = ?").run(SESSION_SCOPE, id);
  });
  tx();
  return true;
}

/** 清空 = 只删消息，保留会话壳 */
export function clearSession(id: string): boolean {
  const db = getDb();
  if (!allSessionMeta().has(id)) return false;
  db.prepare("DELETE FROM ai_messages WHERE session_id = ?").run(id);
  return true;
}

export function listMessages(sessionId: string): ChatMessage[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at, rowid")
    .all(sessionId) as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    role: (r.role === "user" || r.role === "assistant" || r.role === "system" ? r.role : "user") as ChatMessage["role"],
    content: r.content ?? "",
    created_at: r.created_at,
  }));
}

function insertMessage(sessionId: string, role: "user" | "assistant", content: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO ai_messages (id, session_id, role, content, saved_as_item_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  ).run(crypto.randomUUID(), sessionId, role, content, nowIso());
}

/** 取最近 N 轮上下文：按时间顺序取最后 2N 条 */
export function buildContext(sessionId: string): { role: string; content: string }[] {
  const all = listMessages(sessionId).filter((m) => m.role !== "system" && m.content.trim());
  return all.slice(-CONTEXT_ROUNDS * 2).map((m) => ({ role: m.role, content: m.content }));
}

/* ---------- 模型调用 ---------- */

export interface ChatResult {
  reply: string;
  model: string;
  context_messages: number;
}

/** 一次性对话调用（非流式）。messages 为 OpenAI 格式 */
export async function callChat(messages: { role: string; content: string }[]): Promise<ChatResult> {
  const cfg = getDailyModel();
  if (!cfg.apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages, max_tokens: 2048 }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `模型调用失败(${res.status})`);
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string") throw new Error("模型未返回文本内容");
  return { reply, model: cfg.model, context_messages: messages.length };
}

/**
 * 结构化输出能力预留（本期不落地调用）。
 * 后续分类 / 整理提案 / 记下来等需要程序解析的结果，走这个函数强制 json_object。
 */
export async function callStructured<T>(messages: { role: string; content: string }[]): Promise<T> {
  const cfg = getDailyModel();
  if (!cfg.apiKey) throw new Error("未配置 DEEPSEEK_API_KEY");
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model, messages, max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(data.error?.message || `模型调用失败(${res.status})`);
  const raw = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(raw) as T;
}

/**
 * 发送消息：
 * - mode="temp"：不落库，仅用当条消息调用模型
 * - mode="normal"：落库用户消息 + 最近 10 轮上下文 + 落库回复
 */
export async function sendMessage(input: {
  mode: "temp" | "normal";
  session_id?: string;
  message: string;
}): Promise<ChatResult & { session_id: string | null }> {
  const text = input.message.trim();
  if (!text) throw new Error("消息不能为空");

  if (input.mode === "temp") {
    const r = await callChat([{ role: "user", content: text }]);
    return { ...r, session_id: null };
  }

  const sessionId = input.session_id ?? createSession().id;
  if (!getSession(sessionId)) throw new Error("会话不存在");

  insertMessage(sessionId, "user", text);
  const context = buildContext(sessionId);
  const r = await callChat(context);
  insertMessage(sessionId, "assistant", r.reply);
  return { ...r, session_id: sessionId };
}
