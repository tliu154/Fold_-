/**
 * 笔记索引 + 检索工具（一期 A8）
 * - P9：只索引 .md；启动全量建一次 + 手动刷新（不做自动监听）；目录白名单；绝不索引 key 文件
 * - 只存元数据：路径 / 文件名 / 标题(首个 # 或 frontmatter title) / frontmatter 标签 / mtime；不读正文
 * - 索引存内存（服务重启重建），不新增表；白名单存 data/index-config.json（设置页可改）
 * - 三个只读检索函数：search_notes / get_note / stats —— 供 AI function calling 与设置页预览
 * - 排除：.obsidian / node_modules / .git / 隐藏目录 / 项目自身 Fold_；文件名含 key|secret|env|credential 跳过
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";

export interface NoteMeta {
  path: string;        // 绝对路径
  name: string;        // 文件名（含 .md）
  title: string;
  tags: string[];
  mtime: string;       // ISO
}

export interface IndexConfig {
  dirs: string[];      // 白名单根目录（绝对路径）
}

interface IndexState {
  notes: NoteMeta[];
  builtAt: string | null;
  building: boolean;
}

const DEFAULT_DIRS = ["D:\\我的知识库"];
const EXCLUDE_DIRS = new Set([".obsidian", "node_modules", ".git", ".trash"]);
const EXCLUDE_NAME_RE = /(key|secret|env|credential)/i;
const FOLD_PROJECT_RE = /[\\/]Fold_[\\/]?$/;

const state: IndexState = { notes: [], builtAt: null, building: false };

function configPath(): string {
  return path.join(getDataDir(), "index-config.json");
}

export function getConfig(): IndexConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<IndexConfig>;
    if (Array.isArray(parsed.dirs)) {
      return { dirs: parsed.dirs.filter((d) => typeof d === "string" && d.trim()) };
    }
  } catch { /* 不存在或损坏 → 默认 */ }
  return { dirs: [...DEFAULT_DIRS] };
}

export function setConfig(cfg: IndexConfig): IndexConfig {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ dirs: cfg.dirs }, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return getConfig();
}

/** 从文件头部提取元数据（只读前 4KB，够覆盖 frontmatter + 首个标题） */
function extractMeta(absPath: string): { title: string; tags: string[] } {
  let head = "";
  try {
    const fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    head = buf.subarray(0, n).toString("utf-8");
  } catch { return { title: "", tags: [] }; }

  let title = "";
  const tags: string[] = [];

  if (head.startsWith("---")) {
    const end = head.indexOf("\n---", 3);
    if (end > 0) {
      const fm = head.slice(4, end);
      for (const line of fm.split(/\r?\n/)) {
        const tm = line.match(/^title:\s*(.+)$/);
        if (tm && !title) title = tm[1].trim().replace(/^["']|["']$/g, "");
        const tg = line.match(/^tags:\s*\[(.*)\]/);
        if (tg) {
          for (const t of tg[1].split(",")) {
            const v = t.trim().replace(/^["'#]|["']$/g, "");
            if (v) tags.push(v);
          }
        }
        // 多行 tags（- "#a/b" 形式）
        const tl = line.match(/^\s*-\s+["']?#?([^"'#]+)["']?\s*$/);
        if (tl && tags.length >= 0 && line.trim().startsWith("-") && fm.includes("tags:")) {
          const v = tl[1].trim();
          if (v && !tags.includes(v)) tags.push(v);
        }
      }
    }
  }
  if (!title) {
    const h1 = head.match(/^#\s+(.+)$/m);
    if (h1) title = h1[1].trim();
  }
  return { title, tags };
}

function walk(root: string, out: NoteMeta[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const abs = path.join(root, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith(".") || EXCLUDE_DIRS.has(e.name)) continue;
      if (FOLD_PROJECT_RE.test(abs)) continue; // 项目自身
      walk(abs, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      if (EXCLUDE_NAME_RE.test(e.name)) continue; // 绝不索引疑似密钥文件
      let mtime: string;
      try { mtime = fs.statSync(abs).mtime.toISOString(); }
      catch { continue; }
      const { title, tags } = extractMeta(abs);
      out.push({
        path: abs, name: e.name,
        title: title || e.name.replace(/\.md$/i, ""),
        tags, mtime,
      });
    }
  }
}

/** 全量重建索引（启动时 + 手动刷新）。返回条目数。 */
export function rebuildIndex(): { count: number; builtAt: string } {
  if (state.building) return { count: state.notes.length, builtAt: state.builtAt ?? new Date().toISOString() };
  state.building = true;
  try {
    const out: NoteMeta[] = [];
    for (const dir of getConfig().dirs) walk(path.resolve(dir), out);
    out.sort((a, b) => (a.path < b.path ? -1 : 1));
    state.notes = out;
    state.builtAt = new Date().toISOString();
    return { count: out.length, builtAt: state.builtAt };
  } finally {
    state.building = false;
  }
}

/** 惰性构建：未建过则建一次（服务冷启动后首次使用） */
function ensureIndex(): void {
  if (state.builtAt === null && !state.building) rebuildIndex();
}

export function indexStatus(): { count: number; builtAt: string | null; dirs: string[] } {
  return { count: state.notes.length, builtAt: state.builtAt, dirs: getConfig().dirs };
}

/* ---------- 检索函数（只读，供 function calling 与 API 共用） ---------- */

export interface SearchResult {
  path: string;
  title: string;
  tags: string[];
  mtime: string;
}

/** search_notes：关键词匹配 文件名/标题/路径，可选标签过滤，最多 N 条 */
export function searchNotes(query: {
  keyword?: string;
  tag?: string;
  limit?: number;
}): SearchResult[] {
  ensureIndex();
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
  const kw = (query.keyword ?? "").trim().toLowerCase();
  const tag = (query.tag ?? "").trim().replace(/^["'#]|["']$/g, "");
  return state.notes
    .filter((n) => {
      if (tag && !n.tags.includes(tag)) return false;
      if (kw) {
        const hay = `${n.name} ${n.title} ${n.path}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return Boolean(kw || tag);
    })
    .slice(0, limit)
    .map(({ path: p, title, tags, mtime }) => ({ path: p, title, tags, mtime }));
}

/** get_note：按路径取单条元信息 */
export function getNote(notePath: string): NoteMeta | null {
  ensureIndex();
  const target = path.resolve(notePath);
  return state.notes.find((n) => n.path === target) ?? null;
}

/** stats：按目录或标签统计条目数 */
export function stats(by: "dir" | "tag"): Record<string, number> {
  ensureIndex();
  const result: Record<string, number> = {};
  for (const n of state.notes) {
    if (by === "dir") {
      const rel = n.path.split(path.sep).slice(0, -1).pop() ?? "(根)";
      result[rel] = (result[rel] ?? 0) + 1;
    } else {
      const tags = n.tags.length ? n.tags : ["(无标签)"];
      for (const t of tags) result[t] = (result[t] ?? 0) + 1;
    }
  }
  return result;
}

/** OpenAI function calling 工具定义（挂 A6 普通模式） */
export const NOTE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_notes",
      description: "在用户的本地笔记索引中搜索。适合回答「某个主题的笔记在哪、有哪些相关笔记」。只索引 .md 文件的元数据（路径/标题/标签/修改时间），不含正文。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "关键词，匹配文件名/标题/路径，如「微积分」「YOLO」" },
          tag: { type: "string", description: "可选，frontmatter 标签过滤，如 course/微积分" },
          limit: { type: "number", description: "可选，返回条数上限，默认 10，最大 50" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_note",
      description: "按绝对路径取某条笔记的元信息（标题/标签/修改时间）。",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "笔记的绝对路径（来自 search_notes 结果）" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "stats",
      description: "统计笔记数量：按目录（dir）或按标签（tag）分组计数。适合回答「有多少笔记」类问题。",
      parameters: {
        type: "object",
        properties: { by: { type: "string", enum: ["dir", "tag"], description: "统计维度：dir=按目录，tag=按标签" } },
        required: ["by"],
        additionalProperties: false,
      },
    },
  },
];

/** 执行一次工具调用（只读） */
export function executeToolCall(name: string, args: Record<string, unknown>): unknown {
  if (name === "search_notes") {
    return searchNotes({
      keyword: typeof args.keyword === "string" ? args.keyword : undefined,
      tag: typeof args.tag === "string" ? args.tag : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
  }
  if (name === "get_note") {
    const r = getNote(typeof args.path === "string" ? args.path : "");
    return r ?? { error: "未找到该笔记（可能未在索引或路径不对）" };
  }
  if (name === "stats") {
    return stats(args.by === "tag" ? "tag" : "dir");
  }
  return { error: `未知工具 ${name}` };
}
