/**
 * Qwen 内置联网资讯客户端 + 站内 feed 存储（三期 C3 第 3 轮）
 *
 * 探针实测（2026-11-21）：
 * - 端点 https://dashscope.aliyuncs.com/compatible-mode/v1，model qwen-plus
 * - enable_search:true + search_options{forced_search,enable_source} 会真实联网
 * - response_format:json_object 与 enable_search 可共存
 * - 该兼容端点**不返回结构化 search_info / 可核验来源 URL**，只有正文 [ref_N] 角标
 *
 * 用户裁决：只保留响应里真实出现的 http(s) 链接，否则留空并如实标「未提供」。
 * 模型不可用 / 失败 / 输出异常一律如实标 model_unavailable / ai_failed / ai_bad_output，
 * 不用 mock 假装成功。不改 chat.ts，DeepSeek 日常调用完全不受影响。
 *
 * 存储：复用 items(type=feed)，不新增表；站内轻通知复用 items(type=message)。
 * 不做：自动收藏成文件、进周报、混入 6 类数据源、自动批准 / 发布、改知识库文件。
 */
import crypto from "node:crypto";
import { getDb } from "./db";
import { getSearchModel } from "./config";
import { createMessage } from "./messages";
import { getNewsConfig, markNewsRun, type NewsTopic } from "./news-topics";

export type NewsStatus = "ok" | "model_unavailable" | "ai_failed" | "ai_bad_output";

export interface FeedItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  url_status: "provided" | "not_provided";
  date: string;
  topic_id: string;
  topic_name: string;
  model: string;
  status: NewsStatus;
  source: string;
  fetched_at: string;
  created_at: string;
}

interface FeedPayload {
  title: string;
  summary: string;
  url: string;
  url_status: FeedItem["url_status"];
  date: string;
  topic_id: string;
  topic_name: string;
  model: string;
  status: NewsStatus;
  source: string;
  fetched_at: string;
}

interface ItemRow {
  id: string; payload: string | null; created_at: string; updated_at: string;
}

function nowIso(): string { return new Date().toISOString(); }
function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rowToFeed(r: ItemRow): FeedItem | null {
  try {
    const p = JSON.parse(r.payload || "{}") as Partial<FeedPayload>;
    if (typeof p.title !== "string" || typeof p.summary !== "string") return null;
    return {
      id: r.id, title: p.title, summary: p.summary,
      url: typeof p.url === "string" ? p.url : "",
      url_status: p.url_status === "provided" ? "provided" : "not_provided",
      date: typeof p.date === "string" ? p.date : "",
      topic_id: String(p.topic_id ?? ""), topic_name: String(p.topic_name ?? ""),
      model: String(p.model ?? ""),
      status: (["ok", "model_unavailable", "ai_failed", "ai_bad_output"] as NewsStatus[])
        .includes(p.status as NewsStatus) ? p.status as NewsStatus : "ai_failed",
      source: String(p.source ?? ""), fetched_at: String(p.fetched_at ?? ""),
      created_at: r.created_at,
    };
  } catch { return null; }
}

/** 只读列表：默认排除软删除，按抓取时间倒序 */
export function listFeed(limit = 100, opts: { includeDeleted?: boolean } = {}): FeedItem[] {
  const sql = opts.includeDeleted
    ? "SELECT * FROM items WHERE type = 'feed' ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM items WHERE type = 'feed' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?";
  const rows = getDb().prepare(sql).all(Math.min(Math.max(limit, 1), 500)) as ItemRow[];
  return rows.map(rowToFeed).filter((x): x is FeedItem => x !== null);
}

export function findFeedBySource(source: string): FeedItem | null {
  const row = getDb().prepare(
    "SELECT * FROM items WHERE type = 'feed' AND deleted_at IS NULL"
  ).all() as ItemRow[];
  return row.map(rowToFeed).find((f) => f && f.source === source) ?? null;
}

/** 验收清理用：按 source 前缀删 feed（不碰其它 type） */
export function purgeFeedBySource(prefix: string): number {
  const rows = getDb().prepare("SELECT id, payload FROM items WHERE type = 'feed'").all() as
    { id: string; payload: string | null }[];
  let n = 0;
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload || "{}") as { source?: string };
      if (String(p.source ?? "").startsWith(prefix)) {
        getDb().prepare("DELETE FROM items WHERE id = ?").run(r.id);
        n++;
      }
    } catch { /* 忽略损坏条目 */ }
  }
  return n;
}

interface RawNewsItem { title?: unknown; summary?: unknown; date?: unknown; url?: unknown; }
interface RawNewsOutput { items?: unknown; }

/** 只保留合法且真实出现在响应文本里的 http(s) 链接，否则留空 */
function sanitizeUrl(raw: unknown, responseText: string): { url: string; url_status: FeedItem["url_status"] } {
  if (typeof raw !== "string") return { url: "", url_status: "not_provided" };
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u) || u.length > 500) return { url: "", url_status: "not_provided" };
  if (!responseText.includes(u)) return { url: "", url_status: "not_provided" };
  return { url: u, url_status: "provided" };
}

export interface FetchResult {
  ok: boolean;
  status: NewsStatus;
  topic_id: string | null;
  items: FeedItem[];
  error?: string;
  message_id: string | null;
}

/**
 * 对单个主题取一次资讯：1 次真实 Qwen 调用（能跑通就行）。
 * 失败不抛给上层（API 也要如实回报），统一返回 status。
 */
export async function fetchNewsForTopic(topic: NewsTopic, opts: { sourcePrefix?: string } = {}): Promise<FetchResult> {
  const cfg = getSearchModel();
  const empty = (status: NewsStatus, error?: string): FetchResult => ({
    ok: false, status, topic_id: topic.id, items: [], error, message_id: null,
  });
  if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) {
    return empty("model_unavailable", "未配置 QWEN_API_KEY / QWEN_BASE_URL / QWEN_MODEL");
  }

  const prompt = [
    "你是一个联网资讯助手。请基于真实联网搜索结果，用中文回答。",
    `订阅主题：${topic.name}`,
    `关注方向：${topic.query}`,
    "要求：",
    "1. 给出 2~4 条最新、彼此不重复的资讯，每条含 title（标题）、summary（一句话摘要，不超过 120 字）、date（YYYY-MM-DD 或原文日期，无法确定则空字符串）。",
    "2. url 字段：只有当你能从检索结果里确认到确切的原文链接时才填完整 http(s) 地址；**如果检索结果没有给出可核验的链接，必须填空字符串，绝对不要编造或猜测 URL**。",
    "3. 只输出 JSON 对象：{\"items\":[{\"title\":\"...\",\"summary\":\"...\",\"date\":\"...\",\"url\":\"...\"}]}，不要输出其它文字或 Markdown 代码块。",
    "4. 不确定的事实宁可不写，不要编造论文名、机构名或数字。",
  ].join("\n");

  let text = "";
  let status: NewsStatus = "ok";
  let err: string | undefined;
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 900,
        enable_search: true,
        search_options: { forced_search: true, enable_source: true },
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    text = await res.text();
    if (!res.ok) {
      status = "ai_failed";
      let msg = `模型 HTTP ${res.status}`;
      try { msg += `：${(JSON.parse(text) as { error?: { message?: string } }).error?.message ?? ""}`; } catch { /* noop */ }
      err = msg.slice(0, 300);
    }
  } catch (e) {
    return empty("ai_failed", `模型调用失败：${(e as Error).message}`.slice(0, 300));
  }

  let raws: RawNewsItem[] = [];
  if (status === "ok") {
    try {
      const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(content) as RawNewsOutput;
      if (!Array.isArray(parsed.items)) throw new Error("缺少 items 数组");
      raws = parsed.items as RawNewsItem[];
      if (raws.length === 0) throw new Error("items 为空");
    } catch (e) {
      status = "ai_bad_output";
      err = `模型输出无法解析：${(e as Error).message}`.slice(0, 300);
    }
  }

  const prefix = opts.sourcePrefix ?? "manual";
  const date = todayStr();
  const at = nowIso();
  const created: FeedItem[] = [];
  if (status === "ok") {
    for (const r of raws.slice(0, 4)) {
      const title = typeof r.title === "string" ? r.title.trim().slice(0, 200) : "";
      const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 400) : "";
      if (!title) continue;
      const { url, url_status } = sanitizeUrl(r.url, text);
      const source = `feed:${topic.id}:${date}:${crypto.createHash("sha1").update(title).digest("hex").slice(0, 12)}`;
      if (findFeedBySource(source)) continue; // 按「主题 + 日期 + 标题」幂等去重
      const payload: FeedPayload = {
        title, summary, url, url_status,
        date: typeof r.date === "string" ? r.date.trim().slice(0, 40) : "",
        topic_id: topic.id, topic_name: topic.name, model: cfg.model,
        status, source, fetched_at: at,
      };
      const id = crypto.randomUUID();
      getDb().prepare(
        `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
         VALUES (?, 'feed', ?, '', ?, 1, ?, ?)`
      ).run(id, title, JSON.stringify(payload), at, at);
      const row = getDb().prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow;
      const f = rowToFeed(row);
      if (f) created.push(f);
    }
  }

  // 站内轻通知：成功/失败都如实回报，按 source 去重避免刷屏
  const noteSource = `${prefix}:${topic.id}:${date}:${status}`;
  const body = status === "ok"
    ? `【资讯订阅 · ${topic.name}】本次获取 ${created.length} 条新资讯。\n`
      + created.map((f) => `  · ${f.title}${f.url_status === "provided" ? "" : "（来源链接未返回）"}`).join("\n")
      + `\n\n（Qwen 内置联网；只读预览，不会自动存成文件 / 进周报）`
    : `【资讯订阅 · ${topic.name}】本次未取到资讯。\n状态：${status}\n原因：${err ?? "未知"}\n\n未写入任何 feed 条目，也不用 mock 假装成功。`;
  const msg = createMessage({
    kind: "system",
    title: status === "ok" ? `资讯订阅 · ${topic.name}` : `资讯获取失败 · ${topic.name}`,
    body, source: noteSource,
  }, true);

  return { ok: status === "ok", status, topic_id: topic.id, items: created, error: err, message_id: msg.id };
}

/** 一次抓取所有启用主题（手动按钮与定时共用同一条路径） */
export async function fetchAllNews(opts: { sourcePrefix?: string; topicId?: string } = {}): Promise<FetchResult[]> {
  const cfg = getNewsConfig();
  const topics = cfg.topics.filter((t) => t.enabled && (!opts.topicId || t.id === opts.topicId));
  const out: FetchResult[] = [];
  for (const t of topics) out.push(await fetchNewsForTopic(t, { sourcePrefix: opts.sourcePrefix }));
  return out;
}

/**
 * 定时订阅：由 cron 每分钟调用，按「到点 + 当天没跑过」触发；不补跑。
 * 不注册第 5 个内置定时任务（e2e-scheduler 硬断言 4 个任务），调度状态自理。
 */
export async function runNewsSchedule(now = new Date()): Promise<{ ran: boolean; reason: string }> {
  const cfg = getNewsConfig();
  if (!cfg.schedule.enabled) return { ran: false, reason: "定时订阅已关闭" };
  const d = todayStr(now);
  if (cfg.schedule.last_run_date === d) return { ran: false, reason: "今天已抓取过" };
  const [h, m] = cfg.schedule.time.split(":").map(Number);
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0);
  if (now.getTime() < due.getTime()) return { ran: false, reason: "未到设定时间" };
  const topics = cfg.topics.filter((t) => t.enabled);
  if (!topics.length) return { ran: false, reason: "没有启用的订阅主题" };
  // 先落运行态，避免抓取耗时期间下一次 tick 重复触发
  markNewsRun(d);
  await fetchAllNews({ sourcePrefix: "cron" });
  return { ran: true, reason: `已抓取 ${topics.length} 个主题` };
}
