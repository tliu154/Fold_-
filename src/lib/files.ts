/**
 * 文件浏览器（二期 B1，B2 增补 obsidian:// 跳转）
 * - 只读：名称/类型/大小/修改时间/路径；.md 额外读前 4KB 取标题+标签
 * - 不读正文预览、不编辑、不做 OCR；排除规则沿用 A8（隐藏目录/密钥文件/项目自身）
 * - 单目录遍历上限 5000 文件，防大库卡死
 * - B2：buildObsidianUri 纯函数生成跳转链接，库名为空或路径越权 → null；不写任何文件
 */
import fs from "node:fs";
import path from "node:path";
import { getLibraries } from "./libraries";

const MAX_FILES = 5000;
const EXCLUDE_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".next", "__pycache__", ".venv", "venv"]);
/** B1 排除规则：疑似密钥/凭据文件；B3 整理沿用（导出到别处就泄露了） */
export const EXCLUDE_NAME_RE = /(key|secret|env|credential|token|password)/i;
const SELF_DIR_RE = /[\\/]develop[\\/]Fold_?(?:[\\/]|$)/i;

export interface FileEntry {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: string;
  dir: string;       // 相对根目录的目录
  root: string;      // 所属知识库根
  title?: string;    // 仅 .md
  tags?: string[];   // 仅 .md
  obsidian_uri?: string | null; // B2：跳转链接；库名为空/路径越权时为 null
}

/**
 * 生成 obsidian:// 跳转链接（二期 B2，纯函数）
 * - vault 为空 → null（前端禁用链接并提示填写库名）
 * - 文件路径必须落在某个知识库根内，越权 → null（防拼出真实库链接）
 * - 沿用 B1 排除规则：隐藏目录 / 密钥文件名 / 项目自身
 * - .md 省略扩展名（Obsidian 官方 URI 示例），其它文件保留完整文件名
 * - vault 与 file 做 URL 编码；路径按段编码并保留 `/` 分隔符，便于阅读与调试
 */
export function buildObsidianUri(filePath: string, vault: string, roots: string[]): string | null {
  const v = (vault ?? "").trim();
  if (!v) return null;
  const norm = (s: string) => path.resolve(s).replace(/\\/g, "/").replace(/\/+$/, "");
  const abs = norm(filePath);
  // 落在最长匹配的白名单根下（多目录配置时取最具体的那个）
  const matched = roots
    .map((r) => norm(r))
    .filter((r) => abs.toLowerCase().startsWith(r.toLowerCase() + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!matched) return null;
  let rel = path.relative(matched, abs).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return null;
  const segs = rel.split("/");
  if (segs.some((s) => s.startsWith(".") || EXCLUDE_DIRS.has(s))) return null;
  if (EXCLUDE_NAME_RE.test(segs[segs.length - 1] ?? "")) return null;
  if (SELF_DIR_RE.test("/" + rel)) return null;
  if (rel.toLowerCase().endsWith(".md")) rel = rel.slice(0, -3);
  const encodePath = (s: string) => s.split("/").map(encodeURIComponent).join("/");
  return `obsidian://open?vault=${encodeURIComponent(v)}&file=${encodePath(rel)}`;
}

/**
 * 读 .md 前 4KB 的元数据（标题 / 标签 / frontmatter created）
 * - B1 起用于文件浏览；B3 整理复用同一套解析，不再另写一份
 */
export function readMdMeta(abs: string): { title?: string; tags?: string[]; created?: string; fm_title?: string } {
  let head = "";
  try {
    const fd = fs.openSync(abs, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    head = buf.subarray(0, n).toString("utf-8");
  } catch { return {}; }
  const title = head.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const tags: string[] = [];
  let created: string | undefined;
  let fmTitle: string | undefined;
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const t = line.match(/^tags\s*:\s*\[(.*)\]$/i)?.[1];
      // inline 写法 tags: ["#course/x"] 与块写法要归一成同一个值（去掉引号与 # 前缀）
      if (t) tags.push(...t.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "").replace(/^#/, "")).filter(Boolean));
      const item = line.match(/^\s*-\s+["']?#([^"']+)["']?\s*$/);
      if (item && fm[1].includes("tags:")) tags.push(item[1].trim());
      const c = line.match(/^created\s*:\s*["']?(\d{4}-\d{2}-\d{2})/i)?.[1];
      if (c) created = c;
      const ft = line.match(/^title\s*:\s*["']?(.+?)["']?\s*$/i)?.[1];
      if (ft) fmTitle = ft.trim();
    }
  }
  return { title, tags: Array.from(new Set(tags)).slice(0, 20), created, fm_title: fmTitle };
}

function walk(root: string, dir: string, out: FileEntry[]): void {
  if (out.length >= MAX_FILES) return;
  let names: string[];
  try { names = fs.readdirSync(dir); }
  catch { return; }
  for (const name of names) {
    if (out.length >= MAX_FILES) return;
    const abs = path.join(dir, name);
    const rel = path.relative(root, abs);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); }
    catch { continue; }
    if (stat.isDirectory()) {
      if (name.startsWith(".") || EXCLUDE_DIRS.has(name)) continue;
      if (SELF_DIR_RE.test(abs)) continue;
      walk(root, abs, out);
    } else if (stat.isFile()) {
      if (EXCLUDE_NAME_RE.test(name)) continue;
      const ext = path.extname(name).toLowerCase();
      const entry: FileEntry = {
        path: abs, name, ext: ext || "(无)", size: stat.size,
        mtime: stat.mtime.toISOString(),
        dir: path.dirname(rel) === "." ? "(根)" : path.dirname(rel).replace(/\\/g, "/"),
        root,
      };
      if (ext === ".md") {
        const meta = readMdMeta(abs);
        if (meta.title) entry.title = meta.title;
        if (meta.tags) entry.tags = meta.tags;
      }
      out.push(entry);
    }
  }
}

export interface FileQuery {
  kind?: string;      // 类型筛选：md / pdf / html / doc / other / all
  dir?: string;       // 目录筛选（前缀匹配）
  limit?: number;
}

export function listFiles(q: FileQuery = {}): { total: number; truncated: boolean; files: FileEntry[] } {
  const cfg = getLibraries();
  const all: FileEntry[] = [];
  for (const root of cfg.knowledgeDirs) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    walk(root, root, all);
  }
  let files = all;
  const kind = q.kind && q.kind !== "all" ? q.kind : undefined;
  if (kind) {
    files = files.filter((f) => {
      if (kind === "other") return ![".md", ".pdf", ".html", ".htm", ".doc", ".docx"].includes(f.ext);
      if (kind === "doc") return [".doc", ".docx"].includes(f.ext);
      if (kind === "html") return [".html", ".htm"].includes(f.ext);
      return f.ext === `.${kind}`;
    });
  }
  if (q.dir) files = files.filter((f) => f.dir === q.dir || f.dir.startsWith(q.dir!));
  const total = files.length;
  const limit = Math.min(Math.max(q.limit ?? 200, 1), 500);
  const page = files.slice(0, limit).map((f) => ({
    ...f,
    obsidian_uri: buildObsidianUri(f.path, cfg.obsidianVault, cfg.knowledgeDirs),
  }));
  return { total, truncated: total > limit, files: page };
}

export function getFileMeta(p: string): FileEntry | null {
  const cfg = getLibraries();
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const target = norm(path.resolve(p));
  // 必须在配置的知识库目录内（安全）
  const inScope = cfg.knowledgeDirs.some((root) => target.startsWith(norm(path.resolve(root)) + "/"));
  if (!inScope) return null;
  let stat: fs.Stats;
  try { stat = fs.statSync(p); if (!stat.isFile()) return null; }
  catch { return null; }
  if (EXCLUDE_NAME_RE.test(path.basename(p))) return null;
  const abs = path.resolve(p);
  const root = cfg.knowledgeDirs.find((r) => abs.startsWith(path.resolve(r))) ?? path.dirname(abs);
  const rel = path.relative(root, abs);
  const ext = path.extname(abs).toLowerCase();
  const entry: FileEntry = {
    path: abs, name: path.basename(abs), ext: ext || "(无)",
    size: stat.size, mtime: stat.mtime.toISOString(),
    dir: path.dirname(rel) === "." ? "(根)" : path.dirname(rel).replace(/\\/g, "/"),
    root,
  };
  if (ext === ".md") {
    const meta = readMdMeta(abs);
    if (meta.title) entry.title = meta.title;
    if (meta.tags) entry.tags = meta.tags;
  }
  entry.obsidian_uri = buildObsidianUri(abs, cfg.obsidianVault, cfg.knowledgeDirs);
  return entry;
}

/** 可用目录列表（供筛选下拉） */
export function listDirs(): string[] {
  const { files } = listFiles({ limit: 500 });
  return Array.from(new Set(files.map((f) => f.dir))).sort();
}
