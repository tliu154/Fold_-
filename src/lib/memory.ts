/**
 * 三层记忆 + 功能映射表（一期 A7）
 * - 三层：① 基础身份(常驻) ② 功能记忆(按功能切换) ③ 临时上下文(= A6 最近10轮对话历史，不在此重复实现)
 * - 数据：复用 memory 表，**不新增表**
 *   - 记忆条目 scope：profile / feature:<功能> / fact
 *   - 映射覆盖 scope：memory_map, key=mapping
 *   - 与 A6 会话壳 scope=chat_session 完全隔离
 * - 映射表：默认规则写 TS 常量（总纲"写程序里"），memory 表可存覆盖（P12"设置里配置"）
 * - 本期只有已实做的 A6 普通对话(chat) 生效；assistant/capture/report 留预留条目
 * - 稳定规范放记忆、易变数据留给 A8 检索工具；不做自动沉淀、不做手动切换界面
 */
import crypto from "node:crypto";
import { getDb } from "./db";

export type MemoryScope = "profile" | "feature" | "fact";

export interface MemoryItem {
  id: string;              // memory.key
  scope: MemoryScope;
  feature?: string;        // scope=feature 时的功能名
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
}

interface StoredItem {
  title: string;
  content: string;
  tags: string[];
}

export interface FeatureMapping {
  /** 基础身份层是否常驻注入 */
  profile: boolean;
  /** 该功能记忆模块 id 列表 */
  features: string[];
  /** 临时上下文（A6 对话历史）是否注入 */
  context: boolean;
}

export type MappingTable = Record<string, FeatureMapping>;

/** 默认映射（TS 常量，贴合总纲「组合规则写程序里」） */
export const DEFAULT_MAPPING: MappingTable = {
  // 本期真正在用的功能
  chat: { profile: true, features: ["chat"], context: true },
  // 预留条目：对应功能尚未实做，映射表先登记但不生效
  assistant: { profile: true, features: ["assistant"], context: false },
  capture: { profile: false, features: ["capture"], context: false },
  report: { profile: true, features: ["report"], context: true },
};

/** 预设模板：可编程改，用户也能在设置页编辑 */
const PRESET_ITEMS: Omit<MemoryItem, "id" | "updated_at">[] = [
  {
    scope: "profile", title: "身份与背景",
    content: "用户是大学一年级在读学生，中文交流。正在学习编程与数学基础，对 AI / 计算机视觉 / 图形学方向感兴趣。",
    tags: ["身份", "常驻"],
  },
  {
    scope: "profile", title: "交流语气",
    content: "直接、简洁，不堆客套话；错误要直接指出。中文简体。",
    tags: ["语气", "常驻"],
  },
  {
    scope: "profile", title: "讲解偏好",
    content: "数学与技术类内容要「直觉先行、够用就好」：先讲清在干嘛、为什么需要，再落到严格定义；符号首次出现配读法与人话解释；标清「学到哪就够、什么可跳过」。",
    tags: ["偏好", "常驻"],
  },
  {
    scope: "profile", title: "长期目标",
    content: "打好数学与工程基础，逐步转向 AI / CV / CG 方向的实际项目。",
    tags: ["目标", "常驻"],
  },
  {
    scope: "feature", feature: "chat", title: "普通对话约定",
    content: "回答优先给结论，再补必要理由；不确定就说不确定，不编造。涉及代码或命令时给出可直接用的形式。",
    tags: ["chat", "对话"],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function scopeKey(item: { scope: MemoryScope; feature?: string }): string {
  return item.scope === "feature" ? `feature:${item.feature ?? ""}` : item.scope;
}

function parseStored(raw: string): StoredItem {
  try {
    const v = JSON.parse(raw) as Partial<StoredItem>;
    return {
      title: typeof v.title === "string" ? v.title : "",
      content: typeof v.content === "string" ? v.content : "",
      tags: Array.isArray(v.tags) ? v.tags.filter((t) => typeof t === "string") : [],
    };
  } catch {
    return { title: "", content: "", tags: [] };
  }
}

/** 懒初始化：首次访问时写入预设模板（之后用户可随意改/删，不再覆盖） */
function ensurePreset(): void {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) n FROM memory WHERE scope IN ('profile','fact') OR scope LIKE 'feature:%'")
    .get() as { n: number };
  if (count.n > 0) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO memory (scope, key, value, updated_at) VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    for (const item of PRESET_ITEMS) {
      const stored: StoredItem = { title: item.title, content: item.content, tags: item.tags };
      insert.run(scopeKey(item), crypto.randomUUID(), JSON.stringify(stored), nowIso());
    }
  });
  tx();
}

export function listMemoryItems(filter?: { scope?: MemoryScope; tag?: string }): MemoryItem[] {
  ensurePreset();
  const db = getDb();
  const rows = db
    .prepare("SELECT scope, key, value, updated_at FROM memory WHERE scope IN ('profile','fact') OR scope LIKE 'feature:%'")
    .all() as { scope: string; key: string; value: string; updated_at: string }[];
  let items: MemoryItem[] = rows.map((r) => {
    const v = parseStored(r.value);
    const isFeature = r.scope.startsWith("feature:");
    return {
      id: r.key,
      scope: (isFeature ? "feature" : r.scope) as MemoryScope,
      feature: isFeature ? r.scope.slice("feature:".length) : undefined,
      title: v.title,
      content: v.content,
      tags: v.tags,
      updated_at: r.updated_at,
    };
  });
  if (filter?.scope) items = items.filter((i) => i.scope === filter.scope);
  if (filter?.tag) items = items.filter((i) => i.tags.includes(filter.tag!));
  return items.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export interface MemoryInput {
  scope: MemoryScope;
  feature?: string;
  title: string;
  content: string;
  tags?: string[];
}

export function createMemoryItem(input: MemoryInput): MemoryItem {
  ensurePreset();
  const db = getDb();
  const id = crypto.randomUUID();
  const stored: StoredItem = {
    title: input.title, content: input.content, tags: input.tags ?? [],
  };
  db.prepare("INSERT INTO memory (scope, key, value, updated_at) VALUES (?, ?, ?, ?)")
    .run(scopeKey(input), id, JSON.stringify(stored), nowIso());
  return listMemoryItems().find((i) => i.id === id)!;
}

export function updateMemoryItem(id: string, patch: Partial<MemoryInput>): MemoryItem | null {
  const db = getDb();
  const row = db.prepare("SELECT scope, value FROM memory WHERE key = ?").get(id) as
    | { scope: string; value: string } | undefined;
  if (!row) return null;
  const cur = parseStored(row.value);
  const stored: StoredItem = {
    title: patch.title ?? cur.title,
    content: patch.content ?? cur.content,
    tags: patch.tags ?? cur.tags,
  };
  // scope 只在显式传入时迁移
  let scope = row.scope;
  if (patch.scope) {
    scope = patch.scope === "feature"
      ? `feature:${patch.feature ?? (row.scope.startsWith("feature:") ? row.scope.slice(8) : "")}`
      : patch.scope;
  } else if (patch.feature && row.scope.startsWith("feature:")) {
    scope = `feature:${patch.feature}`;
  }
  db.prepare("UPDATE memory SET scope = ?, value = ?, updated_at = ? WHERE key = ?")
    .run(scope, JSON.stringify(stored), nowIso(), id);
  return listMemoryItems().find((i) => i.id === id) ?? null;
}

export function deleteMemoryItem(id: string): boolean {
  const db = getDb();
  return db.prepare("DELETE FROM memory WHERE key = ?").run(id).changes > 0;
}

/* ---------- 映射表 ---------- */

const MAP_SCOPE = "memory_map";
const MAP_KEY = "mapping";

/** 读取生效映射：TS 常量为底，memory 表覆盖按功能合并 */
export function getMapping(): MappingTable {
  const db = getDb();
  const row = db.prepare("SELECT value FROM memory WHERE scope = ? AND key = ?")
    .get(MAP_SCOPE, MAP_KEY) as { value: string } | undefined;
  const base: MappingTable = JSON.parse(JSON.stringify(DEFAULT_MAPPING));
  if (!row) return base;
  try {
    const override = JSON.parse(row.value) as Partial<MappingTable>;
    for (const [k, v] of Object.entries(override)) {
      if (v && typeof v === "object") {
        base[k] = {
          profile: typeof v.profile === "boolean" ? v.profile : (base[k]?.profile ?? true),
          features: Array.isArray(v.features) ? v.features : (base[k]?.features ?? []),
          context: typeof v.context === "boolean" ? v.context : (base[k]?.context ?? false),
        };
      }
    }
  } catch { /* 覆盖损坏则用默认值 */ }
  return base;
}

export function setMapping(table: MappingTable): MappingTable {
  const db = getDb();
  db.prepare(
    `INSERT INTO memory (scope, key, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(MAP_SCOPE, MAP_KEY, JSON.stringify(table), nowIso());
  return getMapping();
}

export function resetMapping(): MappingTable {
  const db = getDb();
  db.prepare("DELETE FROM memory WHERE scope = ? AND key = ?").run(MAP_SCOPE, MAP_KEY);
  return getMapping();
}

/** 按标签筛选记忆条目（清单 1.1「记忆打标签便于筛选」） */
export function filterByTags(tags: string[]): MemoryItem[] {
  if (tags.length === 0) return listMemoryItems();
  return listMemoryItems().filter((i) => tags.some((t) => i.tags.includes(t)));
}

/**
 * 按映射表组装 system prompt（三层里的 ①②）。
 * 第③层临时上下文由 A6 的对话历史承担，不在这里拼。
 * 记忆为空时返回空串 → 调用方不注入 system 消息（不浪费 token）。
 */
export function buildSystemPrompt(feature: string): string {
  const map = getMapping()[feature];
  if (!map) return "";
  const all = listMemoryItems();
  const parts: string[] = [];

  if (map.profile) {
    const p = all.filter((i) => i.scope === "profile" && i.content.trim());
    if (p.length) {
      parts.push("【基础身份（始终遵守）】");
      for (const i of p) parts.push(`- ${i.title}：${i.content}`);
    }
  }
  for (const f of map.features) {
    const fItems = all.filter((i) => i.scope === "feature" && i.feature === f && i.content.trim());
    if (fItems.length) {
      parts.push(`【${f} 功能记忆】`);
      for (const i of fItems) parts.push(`- ${i.title}：${i.content}`);
    }
  }
  return parts.join("\n");
}

/** 预览组装结果（设置页 / e2e 校验用） */
export function previewPrompt(feature: string): { feature: string; system: string; mapping: FeatureMapping | null } {
  return { feature, system: buildSystemPrompt(feature), mapping: getMapping()[feature] ?? null };
}
