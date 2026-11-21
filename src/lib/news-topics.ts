/**
 * 资讯订阅主题配置（三期 C3 第 3 轮）
 *
 * 用户 2026-11-21 裁决：**独立配置 + 复用通道**。
 * - 主题与定时开关存 data/news-topics.json，不塞进 SETTINGS_CATALOG 第 5 项
 *   （已验收 e2e-settings 硬断言注册表恰好 4 项，不改验收脚本）。
 * - 但「手动 + 管家」双通道原则照旧：手动 PUT 与管家草案共用本文件的
 *   validateNewsConfig() 同一套校验，草案不落库、确认才写。
 * - 不新增表，不新建第 5 个内置定时任务（e2e-scheduler 硬断言 4 个任务）。
 *
 * 预置一条示例主题「AI+CV+CG 科研动向」（用户澄清门选定）。
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";

export interface NewsTopic {
  id: string;
  name: string;
  query: string;
  enabled: boolean;
  created_at: string;
}

export interface NewsSchedule {
  enabled: boolean;
  time: string;          // HH:mm，本地时间；每天到点后由 cron tick 触发一次
  last_run_date: string | null; // YYYY-MM-DD，按天幂等，绝不接受补跑
}

export interface NewsConfig {
  version: 1;
  topics: NewsTopic[];
  schedule: NewsSchedule;
  updated_at: string | null;
}

const MAX_TOPICS = 12;
const MAX_NAME = 60;
const MAX_QUERY = 300;
export const NEWS_LIMITS = { maxTopics: MAX_TOPICS, maxName: MAX_NAME, maxQuery: MAX_QUERY };

const DEFAULT_TOPIC: NewsTopic = {
  id: "topic-ai-cv-cg",
  name: "AI+CV+CG 科研动向",
  query: "最近一周人工智能、计算机视觉、计算机图形学领域值得关注的科研新进展与论文动态，用中文给出 3 条，每条含标题、一句话摘要、时间",
  enabled: true,
  created_at: "2026-11-21T00:00:00.000Z",
};

function configPath(): string { return path.join(getDataDir(), "news-topics.json"); }

function defaults(): NewsConfig {
  return {
    version: 1,
    topics: [{ ...DEFAULT_TOPIC }],
    schedule: { enabled: false, time: "09:30", last_run_date: null },
    updated_at: null,
  };
}

export function getNewsConfig(): NewsConfig {
  try {
    const p = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Partial<NewsConfig>;
    if (p.version === 1 && Array.isArray(p.topics)) {
      const v = validateNewsConfig({ topics: p.topics, schedule: p.schedule });
      if (v.ok) {
        return {
          version: 1,
          topics: (v.value as NewsConfig).topics,
          schedule: (v.value as NewsConfig).schedule,
          updated_at: typeof p.updated_at === "string" ? p.updated_at : null,
        };
      }
    }
  } catch { /* 不存在或损坏 → 默认 */ }
  return defaults();
}

export interface Validation<T = unknown> { ok: boolean; value: T | null; errors: string[]; }

/** 手动 PUT 与管家草案共用的唯一校验入口：任一项非法 → 整批拒绝 */
export function validateNewsConfig(raw: unknown): Validation<NewsConfig> {
  const errors: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawTopics = o.topics;
  if (!Array.isArray(rawTopics)) {
    return { ok: false, value: null, errors: ["订阅主题必须是数组"] };
  }
  if (rawTopics.length > MAX_TOPICS) errors.push(`订阅主题最多 ${MAX_TOPICS} 条`);
  const topics: NewsTopic[] = [];
  const seen = new Set<string>();
  for (const t of rawTopics) {
    if (!t || typeof t !== "object") { errors.push("主题条目必须是对象"); continue; }
    const x = t as Record<string, unknown>;
    const id = typeof x.id === "string" ? x.id.trim() : "";
    const name = typeof x.name === "string" ? x.name.trim() : "";
    const query = typeof x.query === "string" ? x.query.trim() : "";
    if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id)) errors.push("主题 id 只能是字母/数字/下划线/连字符，最长 60");
    if (seen.has(id)) errors.push(`主题 id 重复：${id}`);
    seen.add(id);
    if (!name || name.length > MAX_NAME) errors.push(`主题名称须 1~${MAX_NAME} 字`);
    if (!query || query.length > MAX_QUERY) errors.push(`订阅描述须 1~${MAX_QUERY} 字`);
    if (typeof x.enabled !== "boolean") errors.push(`主题 ${name || id} 的 enabled 须为 true/false`);
    topics.push({
      id, name: name.slice(0, MAX_NAME), query: query.slice(0, MAX_QUERY),
      enabled: x.enabled === true,
      created_at: typeof x.created_at === "string" ? x.created_at : new Date().toISOString(),
    });
  }
  // 定时配置：允许前端只传 topics，其它字段保留当前值
  const cur = getNewsConfigSafe();
  const rawSched = (o.schedule && typeof o.schedule === "object")
    ? o.schedule as Record<string, unknown> : {};
  const time = typeof rawSched.time === "string" ? rawSched.time.trim() : cur.schedule.time;
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!timeOk) errors.push("定时时间须为 HH:mm（24 小时制）");
  if (rawSched.enabled !== undefined && typeof rawSched.enabled !== "boolean") {
    errors.push("定时开关 enabled 须为 true/false");
  }
  const schedule: NewsSchedule = {
    enabled: typeof rawSched.enabled === "boolean" ? rawSched.enabled : cur.schedule.enabled,
    time: timeOk ? time : cur.schedule.time,
    last_run_date: typeof rawSched.last_run_date === "string" ? rawSched.last_run_date : cur.schedule.last_run_date,
  };
  return errors.length
    ? { ok: false, value: null, errors }
    : { ok: true, value: { version: 1, topics, schedule, updated_at: null }, errors: [] };
}

/** 供校验内部读取旧值，避免递归（不触发 defaults 落盘） */
function getNewsConfigSafe(): NewsConfig {
  try {
    const p = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Partial<NewsConfig>;
    if (p.version === 1) {
      return {
        version: 1,
        topics: Array.isArray(p.topics) ? p.topics as NewsTopic[] : [{ ...DEFAULT_TOPIC }],
        schedule: {
          enabled: p.schedule?.enabled === true,
          time: typeof p.schedule?.time === "string" ? p.schedule.time : "09:30",
          last_run_date: typeof p.schedule?.last_run_date === "string" ? p.schedule.last_run_date : null,
        },
        updated_at: typeof p.updated_at === "string" ? p.updated_at : null,
      };
    }
  } catch { /* 首次 */ }
  return defaults();
}

/** 唯一落库入口（原子替换） */
export function setNewsConfig(cfg: NewsConfig): NewsConfig {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const next: NewsConfig = { ...cfg, version: 1, updated_at: new Date().toISOString() };
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return next;
}

/** 只更新定时运行态（不改主题，供 cron 按天幂等用） */
export function markNewsRun(date: string): void {
  const cur = getNewsConfig();
  setNewsConfig({ ...cur, schedule: { ...cur.schedule, last_run_date: date } });
}
