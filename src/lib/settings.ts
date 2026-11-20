/**
 * L0 配置注册表 + 统一校验 + 改动历史 / 一键回滚（三期 C3 第 2 轮）
 *
 * 定位（用户 2026-11-20）：管家 = 懂接口的人，用来替代手动改那些复杂配置；
 * 所有自定义设置都要「手动 + 管家」两条路，只有极简开关可以只有手动。
 * 本轮先登记 4 项试点；**写死开关与 AI 通道共用同一套校验，AI 绕不过去**。
 *
 * 硬约束：
 * - 不新增表：改动历史复用 items(type='setting_history')
 * - AI 绝不直接落库：草案只是数据，apply 前重新校验才写
 * - 敏感项（库路径 / 密钥 / dirMap / 鉴权 / 限流 / 排除规则）一律只准手动改，
 *   AI 草案里出现也拦下并回显原因
 * - 配置存 data/*.json（原子替换）；不常驻监听、不让定时任务自动改设置
 */
import crypto from "node:crypto";
import { getDb } from "./db";
import { getReportSources, setReportSources, SOURCE_CATALOG, type SourceId } from "./report-sources";
import { getFilingRules, setFilingRules, validateFilingRules, type FilingRule } from "./filing-rules";
import { getOpenWith, setOpenWith, validateOpenWith, type OpenMode } from "./open-with";

export type SettingKey = "filing_rules" | "report_sources" | "manual_highlights" | "open_with";

export interface SettingDef {
  key: SettingKey;
  label: string;
  desc: string;
  /** 是否允许管家（AI）改 */
  ai: boolean;
  /** 是否「极其简单」——极简项可只保留手动开关 */
  simple: boolean;
  impact: string;
}

export const SETTINGS_CATALOG: SettingDef[] = [
  { key: "filing_rules", label: "整理规范规则表",
    desc: "内部库未分类文件按扩展名归到哪个目录 / 用什么标签", ai: true, simple: false,
    impact: "内部库整理提案的分类结果（下次预览生效，已生成未批准提案不受影响）" },
  { key: "report_sources", label: "周报数据源开关",
    desc: "6 类站内数据源哪些进周报", ai: true, simple: false,
    impact: "下次生成周报的固定数字区块" },
  { key: "manual_highlights", label: "周报手动重点",
    desc: "自己填的本周重点，原样进周报、不经过 AI", ai: true, simple: false,
    impact: "下次生成周报的手动重点区块" },
  { key: "open_with", label: "文件打开方式映射",
    desc: "哪些扩展名走 Obsidian、其它走系统默认应用", ai: true, simple: false,
    impact: "知识库文件树的单击 / 双击打开行为" },
];

/** 只准手动改的敏感项（AI 草案出现即拦截） */
export const MANUAL_ONLY_KEYS = [
  "knowledgeDirs", "projectDirs", "indexDirs", "exportVault", "inboxDir",
  "dirMap", "obsidianVault", "auth", "password", "sessionSecret",
  "rateLimit", "EXCLUDE_NAME_RE", "tidy", "scheduler",
];

export const AI_ALLOWED_KEYS: SettingKey[] = SETTINGS_CATALOG.filter((s) => s.ai).map((s) => s.key);

export function isSettingKey(key: string): key is SettingKey {
  return SETTINGS_CATALOG.some((s) => s.key === key);
}

/* ---------------- 统一读写 ---------------- */

export function readSetting(key: SettingKey): unknown {
  switch (key) {
    case "filing_rules": return getFilingRules();
    case "report_sources": return { enabled: getReportSources().enabled };
    case "manual_highlights": return { manual_highlights: getReportSources().manual_highlights };
    case "open_with": {
      const c = getOpenWith();
      return { obsidian_exts: c.obsidian_exts, default: c.default };
    }
  }
}

export interface Validation { ok: boolean; value: unknown; errors: string[]; }

/** 写死开关与 AI 通道共用：任何来源的值都必须过这里 */
export function validateSetting(key: SettingKey, value: unknown): Validation {
  switch (key) {
    case "filing_rules": {
      const v = validateFilingRules(value);
      return { ok: v.ok, value: v.value, errors: v.errors };
    }
    case "report_sources": {
      const errors: string[] = [];
      const raw = (value ?? {}) as Record<string, unknown>;
      const source = (raw.enabled && typeof raw.enabled === "object" ? raw.enabled : raw) as Record<string, unknown>;
      const ids = SOURCE_CATALOG.map((s) => s.id);
      const cur = getReportSources().enabled;
      const enabled = {} as Record<SourceId, boolean>;
      for (const id of ids) {
        const v = source[id];
        if (typeof v === "boolean") enabled[id] = v;
        else if (v === undefined) enabled[id] = cur[id];
        else errors.push(`${id} 必须是 true/false`);
      }
      for (const k of Object.keys(source)) {
        if (!ids.includes(k as SourceId)) errors.push(`未知数据源：${k}`);
      }
      return { ok: errors.length === 0, value: { enabled }, errors };
    }
    case "manual_highlights": {
      const raw = (value ?? {}) as Record<string, unknown>;
      const list = Array.isArray(raw.manual_highlights)
        ? raw.manual_highlights : Array.isArray(value) ? value : null;
      if (!list) return { ok: false, value: null, errors: ["手动重点必须是数组"] };
      if (list.length > 20) return { ok: false, value: null, errors: ["手动重点最多 20 条"] };
      const items = list
        .filter((x) => typeof x === "string" && x.trim())
        .map((x) => String(x).trim().slice(0, 200));
      return { ok: true, value: { manual_highlights: items }, errors: [] };
    }
    case "open_with": {
      const v = validateOpenWith(value);
      return { ok: v.ok, value: v.value, errors: v.errors };
    }
  }
}

export function writeSetting(key: SettingKey, value: unknown): void {
  switch (key) {
    case "filing_rules": setFilingRules(value as FilingRule[]); break;
    case "report_sources":
      setReportSources({ enabled: (value as { enabled: Record<SourceId, boolean> }).enabled });
      break;
    case "manual_highlights":
      setReportSources({ manual_highlights: (value as { manual_highlights: string[] }).manual_highlights });
      break;
    case "open_with": {
      const v = value as { obsidian_exts: string[]; default: OpenMode };
      setOpenWith({ obsidian_exts: v.obsidian_exts, default: v.default });
      break;
    }
  }
}

/* ---------------- 改动历史（复用 items，不新增表） ---------------- */

export interface SettingHistoryEntry {
  id: string;
  at: string;
  key: SettingKey;
  before: unknown;
  after: unknown;
  source: string;
  note: string;
}

interface Row { id: string; payload: string | null; created_at: string; }

export function listSettingHistory(limit = 100): SettingHistoryEntry[] {
  const rows = getDb().prepare(
    "SELECT id, payload, created_at FROM items WHERE type = 'setting_history' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?"
  ).all(Math.min(Math.max(limit, 1), 500)) as Row[];
  const out: SettingHistoryEntry[] = [];
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload || "{}") as Partial<SettingHistoryEntry>;
      if (!isSettingKey(String(p.key ?? ""))) continue;
      out.push({
        id: r.id,
        at: typeof p.at === "string" ? p.at : r.created_at,
        key: p.key as SettingKey,
        before: p.before ?? null,
        after: p.after ?? null,
        source: String(p.source ?? ""),
        note: String(p.note ?? ""),
      });
    } catch { /* 跳过损坏的历史条目 */ }
  }
  return out;
}

function appendHistory(e: Omit<SettingHistoryEntry, "id">): SettingHistoryEntry {
  const id = crypto.randomUUID();
  const entry: SettingHistoryEntry = { id, ...e };
  getDb().prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'setting_history', ?, '', ?, 1, ?, ?)`
  ).run(
    id, `设置改动：${e.key}`,
    JSON.stringify({ at: e.at, key: e.key, before: e.before, after: e.after, source: e.source, note: e.note }),
    e.at, e.at,
  );
  return entry;
}

/* ---------------- 应用（唯一落库入口） ---------------- */

export interface ApplyChange { key: string; value: unknown; }
export interface ApplyResult {
  ok: boolean;
  applied: SettingKey[];
  errors: { key: string; errors: string[] }[];
  history: SettingHistoryEntry[];
}

/** 全部校验通过才落库；任一项非法 → 整批拒绝，不写半个值 */
export function applySettings(changes: ApplyChange[], source = "manual"): ApplyResult {
  const errors: { key: string; errors: string[] }[] = [];
  const byKey = new Map<SettingKey, unknown>();
  for (const c of changes) {
    const key = typeof c.key === "string" ? c.key.trim() : "";
    if (!isSettingKey(key)) {
      errors.push({ key, errors: ["未登记的设置项，或只准手动修改的敏感项"] });
      continue;
    }
    byKey.set(key, c.value); // 同一 key 只保留最后一条
  }
  const prepared: { key: SettingKey; before: unknown; after: unknown }[] = [];
  for (const [key, raw] of byKey) {
    const v = validateSetting(key, raw);
    if (!v.ok) errors.push({ key, errors: v.errors });
    else prepared.push({ key, before: readSetting(key), after: v.value });
  }
  if (errors.length) return { ok: false, applied: [], errors, history: [] };

  const history: SettingHistoryEntry[] = [];
  const at = new Date().toISOString();
  for (const p of prepared) {
    writeSetting(p.key, p.after);
    history.push(appendHistory({ at, key: p.key, before: p.before, after: p.after, source, note: "" }));
  }
  return { ok: true, applied: prepared.map((p) => p.key), errors: [], history };
}

/* ---------------- 一键回滚 ---------------- */

export interface RevertResult {
  ok: boolean;
  needsConfirm?: boolean;
  message?: string;
  entry?: SettingHistoryEntry;
}

export function revertSettingHistory(id: string, opts: { confirm?: boolean; source?: string } = {}): RevertResult {
  const e = listSettingHistory(500).find((x) => x.id === id);
  if (!e) return { ok: false, message: "历史条目不存在" };
  const v = validateSetting(e.key, e.before);
  if (!v.ok) return { ok: false, message: `改前值已不合法，无法回滚：${v.errors.join("；")}` };
  const cur = readSetting(e.key);
  const newer = JSON.stringify(cur) !== JSON.stringify(e.after);
  if (newer && !opts.confirm) {
    return { ok: false, needsConfirm: true, message: "该项在本次改动之后又被修改过，回滚将覆盖较新的值，请二次确认" };
  }
  writeSetting(e.key, v.value);
  const entry = appendHistory({
    at: new Date().toISOString(), key: e.key, before: cur, after: v.value,
    source: opts.source ?? "revert", note: `撤销 ${id}${newer ? "（覆盖较新值）" : ""}`,
  });
  return { ok: true, entry };
}

/** 验收清理：按 source 前缀删历史（不影响配置值） */
export function purgeSettingHistoryBySource(prefix: string): number {
  const db = getDb();
  const rows = db.prepare("SELECT id, payload FROM items WHERE type = 'setting_history'").all() as
    { id: string; payload: string | null }[];
  let n = 0;
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload || "{}") as { source?: string };
      if (String(p.source ?? "").startsWith(prefix)) {
        db.prepare("DELETE FROM items WHERE id = ?").run(r.id);
        n++;
      }
    } catch { /* ignore */ }
  }
  return n;
}

/* ---------------- AI 草案（纯数据，不落库） ---------------- */

export interface AiChange { key?: unknown; value?: unknown; reason?: unknown; }

export interface DraftItem {
  key: string;
  label: string;
  current: unknown;
  proposed: unknown;
  impact: string;
  reason: string;
  valid: boolean;
  blocked: boolean;
  errors: string[];
  enabled: boolean;
}

/** 把模型输出的结构化改动做成逐条草案：白名单 + 校验 + 敏感项拦截，绝不落库 */
export function buildDraft(aiChanges: AiChange[]): DraftItem[] {
  const out: DraftItem[] = [];
  for (const c of aiChanges) {
    const key = typeof c.key === "string" ? c.key.trim() : "";
    const reason = typeof c.reason === "string" ? c.reason.trim().slice(0, 200) : "";
    if (!key) {
      out.push({ key: "(空)", label: "无法识别的改动", current: null, proposed: c.value ?? null,
        impact: "—", reason, valid: false, blocked: true, errors: ["模型输出缺少设置项名"], enabled: false });
      continue;
    }
    if (MANUAL_ONLY_KEYS.includes(key) || !isSettingKey(key)) {
      out.push({ key, label: "敏感 / 未登记设置", current: null, proposed: c.value ?? null,
        impact: "—", reason, valid: false, blocked: true,
        errors: ["该项只准手动修改（库路径 / 密钥 / 目录映射 / 鉴权 / 限流 / 排除规则）"], enabled: false });
      continue;
    }
    const def = SETTINGS_CATALOG.find((s) => s.key === key)!;
    const v = validateSetting(key, c.value);
    out.push({
      key, label: def.label, current: readSetting(key), proposed: v.value,
      impact: def.impact, reason, valid: v.ok, blocked: false,
      errors: v.errors, enabled: v.ok,
    });
  }
  return out;
}
