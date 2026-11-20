/**
 * 整理规范规则表（三期 C3 第 2 轮：从 TS 常量迁到可配文件）
 *
 * - 默认常量保留作兜底；首次读取时把默认值迁移写一份到 data/filing-rules.json
 * - 与 internal-tidy.ts 拆开，避免 settings.ts ↔ internal-tidy.ts 循环依赖
 * - 校验口径：必须有兜底规则（exts 为空）、标签前缀必须在 dirMap 里登记，
 *   否则如实回显「需先在资源库配置页手动添加」，不擅自建目录
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";
import { getLibraries } from "./libraries";

export interface FilingRule {
  id: string;
  label: string;
  /** 命中的扩展名（小写，含点）；空数组 = 兜底全匹配 */
  exts: string[];
  /** 用于 resolveExportDir 推出目标目录的标签 */
  tags: string[];
  /** 分类说明（展示在提案里，让用户看懂为什么这么分） */
  note: string;
}

export const DEFAULT_FILING_RULES: FilingRule[] = [
  { id: "html", label: "网页 / 周报", exts: [".html", ".htm"],
    tags: ["type/周报"], note: "HTML 不读正文、不改内容，按类型归档并在网页里可回顾" },
  { id: "md", label: "Markdown 笔记", exts: [".md", ".markdown"],
    tags: ["type/笔记"], note: "可读前 4KB frontmatter；缺标题/标签时由程序补全" },
  { id: "image", label: "图片", exts: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"],
    tags: ["source/资源库"], note: "只登记元数据，不做 OCR / 不读内容" },
  { id: "doc", label: "文档 / 表格 / PDF", exts: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"],
    tags: ["source/资源库"], note: "只登记元数据，不做解析 / 不读内容" },
  { id: "other", label: "其它格式", exts: [],
    tags: ["type/资料"], note: "管家按整理规范兜底归类；不猜内容、不改文件" },
];

function configPath(): string { return path.join(getDataDir(), "filing-rules.json"); }

export interface RuleValidation {
  ok: boolean;
  value: FilingRule[];
  errors: string[];
}

export function validateFilingRules(input: unknown): RuleValidation {
  const errors: string[] = [];
  if (!Array.isArray(input)) return { ok: false, value: [], errors: ["整理规范必须是数组"] };
  if (input.length === 0) errors.push("至少要有 1 条规则");
  if (input.length > 20) errors.push("规则最多 20 条");
  const allowedPrefixes = Object.keys(getLibraries().dirMap);
  const ids = new Set<string>();
  const value: FilingRule[] = [];

  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`第 ${i + 1} 条不是对象`);
      continue;
    }
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim().slice(0, 40) : "";
    if (!id) errors.push(`第 ${i + 1} 条缺 id`);
    else if (ids.has(id)) errors.push(`规则 id 重复：${id}`);
    ids.add(id);

    const exts: string[] = [];
    if (!Array.isArray(r.exts)) errors.push(`规则 ${id || i + 1} 的 exts 必须是数组`);
    else for (const e of r.exts) {
      if (typeof e !== "string") { errors.push(`规则 ${id || i + 1} 含非字符串扩展名`); continue; }
      const x = e.trim().toLowerCase();
      if (x && !/^\.[a-z0-9]{1,10}$/.test(x)) errors.push(`非法扩展名：${e}`);
      else if (x && !exts.includes(x)) exts.push(x);
    }

    const tags: string[] = [];
    if (!Array.isArray(r.tags)) errors.push(`规则 ${id || i + 1} 的 tags 必须是数组`);
    else for (const t of r.tags) {
      if (typeof t !== "string") { errors.push(`规则 ${id || i + 1} 含非字符串标签`); continue; }
      const x = t.trim().replace(/^#/, "").slice(0, 60);
      if (!x) continue;
      const prefix = x.includes("/") ? x.slice(0, x.indexOf("/") + 1) : "";
      // 说了没登记的目录 → 如实回显，不擅自建目录、不静默改映射
      if (prefix && !allowedPrefixes.includes(prefix)) {
        errors.push(`标签 ${x} 对应的目录映射未登记（需先在资源库配置页手动添加 ${prefix}）`);
      }
      if (!tags.includes(x)) tags.push(x);
    }

    value.push({
      id: id || `rule_${i + 1}`,
      label: typeof r.label === "string" ? r.label.trim().slice(0, 60) : "未命名规则",
      exts,
      tags,
      note: typeof r.note === "string" ? r.note.trim().slice(0, 200) : "",
    });
  }
  // 兜底规则不能删：至少一条 exts 为空
  if (input.length > 0 && !value.some((r) => r.exts.length === 0)) {
    errors.push("不能删除兜底规则（必须保留一条 exts 为空的规则）");
  }
  return { ok: errors.length === 0, value, errors };
}

export function getFilingRules(): FilingRule[] {
  try {
    const p = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as { version?: number; rules?: unknown };
    if (p.version === 1 && Array.isArray(p.rules)) {
      const v = validateFilingRules(p.rules);
      if (v.ok) return v.value;
    }
  } catch { /* 不存在 / 损坏 / 校验失败 → 回落默认并重写 */ }
  return setFilingRules(DEFAULT_FILING_RULES);
}

export function setFilingRules(rules: FilingRule[]): FilingRule[] {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, rules }, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return rules;
}

/** 按扩展名找规则；没命中就用兜底规则；都没兜底就用常量最后一条 */
export function ruleForExt(ext: string, rules = getFilingRules()): FilingRule {
  const x = ext.toLowerCase();
  return rules.find((r) => r.exts.includes(x))
    ?? rules.find((r) => r.exts.length === 0)
    ?? DEFAULT_FILING_RULES[DEFAULT_FILING_RULES.length - 1];
}
