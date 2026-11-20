/**
 * 内部文件库（三期 C3 第 1 轮 · 文件底座）
 *
 * 干什么：网站自己产出的所有文件（周报、以后其它特殊类型）统一先落在
 *   `data/internal-vault/未分类/`，并在主库登记索引；整理批准后才移动到
 *   「用户加入的库」（开发阶段 = 测试库）的目标目录。
 *
 * 「类的继承」：文件是父类，周报是子类。全部复用 items(type='file')，
 *   payload.subtype 区分 report / note / other；子类只是多了展示能力，
 *   **仍必须走同一套整理流程**。不新增表。
 *
 * 硬约束：
 * - 内部库物理上在程序自己的 data/ 里，与用户 Obsidian 库（真实库/测试库）隔离
 * - 全格式：不限制扩展名；`.md` 可读 frontmatter，其它格式绝不读正文、绝不改内容
 * - raw 只读路由只按「已登记文件的 id」取路径，客户端不能传任意路径；
 *   路径必须落在内部库或用户加入的库（且开发阶段限定测试库）内
 * - 真实库零接触：分流目标根用按段比较校验，不能用 startsWith
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDataDir } from "./config";
import { getDb } from "./db";
import { isUnder } from "./tidy";
import { getLibraries, TEST_VAULT } from "./libraries";
import { EXCLUDE_NAME_RE, readMdMeta } from "./files";

export type FileSubtype = "report" | "note" | "other";
export type FileStatus = "unsorted" | "filed" | "missing";

export interface InternalFile {
  id: string;
  subtype: FileSubtype;
  filename: string;
  path: string;
  dir: string;                 // 分流目标相对目录（未分流为空串）
  title: string;
  tags: string[];
  ext: string;
  size: number;
  status: FileStatus;
  week: string | null;         // 周报专属：ISO 周键 2026-W47
  commit: string | null;       // 分流时的 git commit
  source: string;
  created_at: string;
  updated_at: string;
  filed_at: string | null;
}

interface ItemRow {
  id: string;
  payload: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function nowIso(): string { return new Date().toISOString(); }

/** 内部库根：data/internal-vault/ */
export function internalRoot(): string {
  return path.join(getDataDir(), "internal-vault");
}
/** 未分类区：所有新文件的唯一入口 */
export function unsortedDir(): string {
  return path.join(internalRoot(), "未分类");
}

export function ensureVault(): void {
  fs.mkdirSync(unsortedDir(), { recursive: true });
}

function parsePayload(raw: string | null, row: ItemRow): InternalFile | null {
  try {
    const p = JSON.parse(raw || "{}") as Partial<InternalFile> & { subtype?: FileSubtype };
    if (typeof p.path !== "string" || typeof p.filename !== "string") return null;
    return {
      id: row.id,
      subtype: p.subtype === "report" || p.subtype === "note" ? p.subtype : "other",
      filename: p.filename,
      path: p.path,
      dir: typeof p.dir === "string" ? p.dir : "",
      title: typeof p.title === "string" ? p.title : p.filename,
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
      ext: typeof p.ext === "string" ? p.ext : path.extname(p.filename).toLowerCase(),
      size: typeof p.size === "number" ? p.size : 0,
      status: p.status === "filed" || p.status === "missing" ? p.status : "unsorted",
      week: typeof p.week === "string" ? p.week : null,
      commit: typeof p.commit === "string" ? p.commit : null,
      source: typeof p.source === "string" ? p.source : "",
      created_at: row.created_at,
      updated_at: row.updated_at,
      filed_at: typeof p.filed_at === "string" ? p.filed_at : null,
    };
  } catch { return null; }
}

export interface RegisterFileInput {
  absPath: string;
  subtype: FileSubtype;
  title: string;
  tags: string[];
  week?: string | null;
  source?: string;
}

/** 登记一份已写入物理磁盘的文件（不写文件，只建索引） */
export function registerFile(input: RegisterFileInput): InternalFile {
  const abs = path.resolve(input.absPath);
  if (!fs.existsSync(abs)) throw new Error(`文件不存在，无法登记：${abs}`);
  const st = fs.statSync(abs);
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const payload: Omit<InternalFile, "id" | "created_at" | "updated_at"> = {
    subtype: input.subtype,
    filename: path.basename(abs),
    path: abs,
    dir: "",
    title: input.title,
    tags: input.tags,
    ext: path.extname(abs).toLowerCase(),
    size: st.size,
    status: "unsorted",
    week: input.week ?? null,
    commit: null,
    source: input.source ?? "",
    filed_at: null,
  };
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'file', ?, '', ?, 1, ?, ?)`
  ).run(id, input.title, JSON.stringify(payload), now, now);
  return getFile(id)!;
}

export function getFile(id: string): InternalFile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'file' AND deleted_at IS NULL").get(id) as
    | ItemRow | undefined;
  return row ? parsePayload(row.payload, row) : null;
}

export function listFiles(opts: { subtype?: FileSubtype; status?: FileStatus; limit?: number } = {}): InternalFile[] {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const rows = db.prepare(
    "SELECT * FROM items WHERE type = 'file' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as ItemRow[];
  let out = rows.map((r) => parsePayload(r.payload, r)).filter((f): f is InternalFile => f !== null);
  if (opts.subtype) out = out.filter((f) => f.subtype === opts.subtype);
  if (opts.status) out = out.filter((f) => f.status === opts.status);
  return out;
}

export function countUnsorted(): number {
  return listFiles({ status: "unsorted", limit: 500 }).length;
}

/** 按 source 前缀找（幂等/清理用） */
export function findBySourcePrefix(prefix: string): InternalFile[] {
  return listFiles({ limit: 500 }).filter((f) => f.source.startsWith(prefix));
}

export interface FilePatch {
  path?: string;
  filename?: string;
  dir?: string;
  title?: string;
  tags?: string[];
  status?: FileStatus;
  commit?: string | null;
  filed_at?: string | null;
}

export function updateFile(id: string, patch: FilePatch): InternalFile | null {
  const cur = getFile(id);
  if (!cur) return null;
  const next: InternalFile = { ...cur, ...patch, id, updated_at: nowIso() };
  const { id: _id, created_at: _c, updated_at: _u, ...payload } = next;
  getDb().prepare(
    "UPDATE items SET title = ?, payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND type = 'file'"
  ).run(next.title, JSON.stringify(payload), next.updated_at, id);
  return getFile(id);
}

export function softDeleteFile(id: string): boolean {
  const db = getDb();
  if (!getFile(id)) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'file'")
    .run(nowIso(), nowIso(), id);
  return true;
}

/* ---------------- 物理文件读取（全格式） ---------------- */

/** 允许读取的根：内部库 + 用户加入的库（开发阶段限定测试库） */
function allowedRoots(): string[] {
  const roots = [internalRoot()];
  const cfg = getLibraries();
  for (const r of [...cfg.knowledgeDirs, cfg.exportVault]) {
    if (typeof r === "string" && r.trim() && isUnder(path.resolve(r), TEST_VAULT)) {
      roots.push(path.resolve(r));
    }
  }
  return roots;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

/** 原始文件读取：只按已登记 id 取路径，双重白名单校验，绝不信任客户端路径 */
export function readRawFile(id: string): { content: Buffer; contentType: string; filename: string } | null {
  const file = getFile(id);
  if (!file) return null;
  const abs = path.resolve(file.path);
  if (EXCLUDE_NAME_RE.test(path.basename(abs))) return null;
  if (!allowedRoots().some((root) => isUnder(abs, root))) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return {
    content: fs.readFileSync(abs),
    contentType: MIME[file.ext] ?? "application/octet-stream",
    filename: file.filename,
  };
}

/**
 * 全格式元数据：`.md` 用 B1 的 readMdMeta 读前 4KB frontmatter；
 * 其它格式**只读文件系统元数据**（绝不读正文、不做 OCR）。
 */
export function readMeta(abs: string): { title?: string; tags?: string[]; created?: string } {
  if (path.extname(abs).toLowerCase() === ".md") {
    const m = readMdMeta(abs);
    return { title: m.fm_title || m.title, tags: m.tags, created: m.created };
  }
  return {};
}

/** 写一份新文件到未分类区（文件名已由调用方规范化，冲突则加序号） */
export function writeToUnsorted(filename: string, content: string | Buffer): string {
  ensureVault();
  let base = path.basename(filename);
  if (EXCLUDE_NAME_RE.test(base)) throw new Error("文件名疑似密钥/凭据，拒绝写入内部库");
  let abs = path.join(unsortedDir(), base);
  let n = 1;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  while (fs.existsSync(abs)) {
    base = `${stem}_${n}${ext}`;
    abs = path.join(unsortedDir(), base);
    n++;
  }
  fs.writeFileSync(abs, content);
  return abs;
}

/** 仅用于验收清理：删除指定 id 的登记与物理文件（不动用户库里已分流的文件） */
export function purgeFile(id: string): void {
  const f = getFile(id);
  if (f && isUnder(f.path, internalRoot())) {
    try { fs.rmSync(f.path, { force: true }); } catch { /* ignore */ }
  }
  const db = getDb();
  db.prepare("DELETE FROM items WHERE id = ? AND type = 'file'").run(id);
}
