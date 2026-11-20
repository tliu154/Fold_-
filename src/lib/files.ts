/**
 * 文件浏览器（二期 B1）
 * - 只读：名称/类型/大小/修改时间/路径；.md 额外读前 4KB 取标题+标签
 * - 不读正文预览、不编辑、不做 OCR；排除规则沿用 A8（隐藏目录/密钥文件/项目自身）
 * - 单目录遍历上限 5000 文件，防大库卡死
 */
import fs from "node:fs";
import path from "node:path";
import { getLibraries } from "./libraries";

const MAX_FILES = 5000;
const EXCLUDE_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".next", "__pycache__", ".venv", "venv"]);
const EXCLUDE_NAME_RE = /(key|secret|env|credential|token|password)/i;
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
}

function readMdMeta(abs: string): { title?: string; tags?: string[] } {
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
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const t = line.match(/^tags\s*:\s*\[(.*)\]$/i)?.[1];
      if (t) tags.push(...t.split(",").map((s) => s.trim().replace(/^["'#]|["']$/g, "")).filter(Boolean));
      const item = line.match(/^\s*-\s+["']?#([^"']+)["']?\s*$/);
      if (item && fm[1].includes("tags:")) tags.push(item[1].trim());
    }
  }
  return { title, tags: Array.from(new Set(tags)).slice(0, 20) };
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
  return { total, truncated: total > limit, files: files.slice(0, limit) };
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
  return entry;
}

/** 可用目录列表（供筛选下拉） */
export function listDirs(): string[] {
  const { files } = listFiles({ limit: 500 });
  return Array.from(new Set(files.map((f) => f.dir))).sort();
}
