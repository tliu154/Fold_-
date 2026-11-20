/**
 * 内部库全格式整理（三期 C3 第 1 轮）
 *
 * 干什么：扫 `data/internal-vault/未分类/` 里的**任意格式**新文件，
 * 按「整理规范」出变更提案 → 用户逐条勾选/编辑 → 批准后从内部库
 * **移动到用户加入的库**（开发阶段 = 测试库）的目标目录，一次批准一次 git commit。
 *
 * 与 B3/C2 的关系（避免重复造轮子 + 不破坏已验收链路）：
 * - 复用 `resolveExportDir`（标签→目录）、`safeName`、`isUnder`、`git`/`ensureRepo`
 * - **不改动** B3 的 `runTidy` / C2 的 `runTidyItems`：它们的输入是
 *   「测试库/未整理」的 .md，本链路输入是「程序内部库/未分类」的全格式文件，
 *   且分流方向相反（内部 → 外部）。两者共用工具函数，不共用执行体。
 *
 * 整理规范（本轮为可配置规则表，纯程序、不调模型）：
 * - `.md`：补 frontmatter 标题 / 标签（程序写，不是 AI 写）
 * - 其它格式（含 HTML 周报）：**只读文件系统元数据**（文件名/大小/mtime/扩展名），
 *   绝不读正文、不做 OCR、不改内容
 * - AI 辅助分类判断留第 2 轮 L0/L1 通道（PRD §9.3），本轮先保证稳定运行
 *
 * 安全：
 * - `from` 必须在未分类区内；`to` 必须在用户库根内；目录限定在 dirMap 允许集合
 * - 客户端传来的 dir / filename 一律服务端重算、safeName 规范化
 * - 目标根按段比较校验落在测试库内（真实库零接触）
 * - 只 `git add` 本次移动的目标路径，不把库里其它改动混进 commit
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDb } from "./db";
import { getLibraries, TEST_VAULT } from "./libraries";
import { resolveExportDir } from "./capture";
import { git, ensureRepo, isUnder, safeName, isLocked } from "./tidy";
import { EXCLUDE_NAME_RE } from "./files";
import {
  unsortedDir, ensureVault, readMeta, listFiles, updateFile,
  type InternalFile, type FileSubtype,
} from "./internal-vault";
import { createMessage } from "./messages";
import { getFilingRules, ruleForExt, type FilingRule } from "./filing-rules";
// 兼容旧引用：规则表已迁到 filing-rules.ts（可配文件 + 默认常量），避免 settings.ts 循环依赖
export { DEFAULT_FILING_RULES } from "./filing-rules";
export type { FilingRule } from "./filing-rules";

/* ---------------- 整理规范（C3 第 2 轮：改为可配规则表） ---------------- */
// 规则表已迁到 filing-rules.ts（可配文件 + 默认常量）。
// 改规则后：已生成但还没批准的内部库提案不受影响（建议已固化），下次预览才用新规则。

function ruleFor(ext: string): FilingRule {
  return ruleForExt(ext, getFilingRules());
}

/** 允许的目标目录集合：dirMap 的值 + 回落目录「笔记」 */
export function allowedDirs(): string[] {
  const vals = Object.values(getLibraries().dirMap).filter((v) => typeof v === "string" && v.trim());
  return Array.from(new Set([...vals, "笔记"]));
}

/* ---------------- 提案数据结构 ---------------- */

export type FilingStatus = "pending" | "approved" | "rejected" | "stale";

export interface FilingItem {
  from: string;               // 内部库未分类区绝对路径
  file_id: string;            // 对应 items(type=file) 的 id
  filename: string;           // 目标文件名
  dir: string;                // 目标子目录（相对用户库根）
  title: string;
  tags: string[];
  ext: string;
  subtype: FileSubtype;
  actions: string[];
  enabled: boolean;
  rule: string;
  note: string;
  reason?: string;            // 跳过原因
}

export interface FilingProposal {
  id: string;
  status: FilingStatus;
  items: FilingItem[];
  source: string;
  commit: string | null;
  counts: { total: number; enabled: number; skipped: number };
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  payload: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function nowIso(): string { return new Date().toISOString(); }
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function fmtDate(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function parseProposal(raw: string | null, row: ItemRow): FilingProposal | null {
  try {
    const p = JSON.parse(raw || "{}") as Partial<FilingProposal>;
    if (!Array.isArray(p.items)) return null;
    return {
      id: row.id,
      status: p.status === "approved" || p.status === "rejected" || p.status === "stale" ? p.status : "pending",
      items: p.items as FilingItem[],
      source: typeof p.source === "string" ? p.source : "",
      commit: typeof p.commit === "string" ? p.commit : null,
      counts: p.counts ?? { total: 0, enabled: 0, skipped: 0 },
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch { return null; }
}

export function getFilingProposal(id: string): FilingProposal | null {
  const row = getDb().prepare(
    "SELECT * FROM items WHERE id = ? AND type = 'filing_proposal' AND deleted_at IS NULL"
  ).get(id) as ItemRow | undefined;
  return row ? parseProposal(row.payload, row) : null;
}

export function listFilingProposals(status?: FilingStatus): { proposals: FilingProposal[]; pending: number } {
  const rows = getDb().prepare(
    "SELECT * FROM items WHERE type = 'filing_proposal' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200"
  ).all() as ItemRow[];
  let out = rows.map((r) => parseProposal(r.payload, r)).filter((p): p is FilingProposal => p !== null);
  const pending = out.filter((p) => p.status === "pending").length;
  if (status) out = out.filter((p) => p.status === status);
  return { proposals: out, pending };
}

function saveProposalRow(p: FilingProposal): void {
  const { id, created_at, updated_at, ...payload } = p;
  getDb().prepare(
    "UPDATE items SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND type = 'filing_proposal'"
  ).run(JSON.stringify(payload), p.updated_at, id);
}

/* ---------------- 预览（纯读，不落库、不写文件） ---------------- */

export interface FilingPreview {
  unsorted: string;
  root: string;                 // 分流目标库根
  dirMap: Record<string, string>;
  allowedDirs: string[];
  rules: FilingRule[];
  counts: { total: number; ready: number; skipped: number };
  items: FilingItem[];
  pending: number;
}

/** 扫描未分类区物理文件，为每个文件生成一条整理建议（纯读） */
export function previewFiling(): FilingPreview {
  ensureVault();
  const cfg = getLibraries();
  const root = path.resolve(cfg.exportVault || TEST_VAULT);
  if (!isUnder(root, TEST_VAULT)) {
    throw new Error(`分流目标库必须位于测试知识库内：${root}（真实库零接触）`);
  }
  const dirMap = cfg.dirMap;
  const unsorted = unsortedDir();
  const dirs = allowedDirs();

  // 已登记文件（按绝对路径索引），用于带出 subtype / week / 标题
  const registered = new Map<string, InternalFile>();
  for (const f of listFiles({ limit: 500 })) {
    registered.set(path.resolve(f.path).toLowerCase(), f);
  }

  const names = fs.readdirSync(unsorted).filter((n) => {
    if (n.startsWith(".")) return false;
    try { return fs.statSync(path.join(unsorted, n)).isFile(); } catch { return false; }
  });

  const items: FilingItem[] = [];
  for (const name of names) {
    const from = path.join(unsorted, name);
    const ext = path.extname(name).toLowerCase();
    const reg = registered.get(path.resolve(from).toLowerCase());
    const rule = ruleFor(ext);
    const meta = readMeta(from);
    const title = safeName((reg?.title || meta.title || path.basename(name, ext)).trim() || "未命名");
    const tags = Array.from(new Set([...(reg?.tags ?? []), ...(meta.tags ?? []), ...rule.tags]));
    const dir = resolveExportDir(tags, dirMap);
    const safeDir = dirs.includes(dir) ? dir : "笔记";
    const st = fs.statSync(from);
    const date = meta.created && /^\d{4}-\d{2}-\d{2}$/.test(meta.created)
      ? meta.created : fmtDate(st.mtime);
    const filename = `${date}_${safeName(title)}${ext}`;
    const actions = ["移动"];
    if (filename !== name) actions.push("重命名");
    if (ext === ".md" && (!meta.title || (meta.tags?.length ?? 0) === 0)) actions.push("补标题/标签");

    const item: FilingItem = {
      from, file_id: reg?.id ?? "", filename, dir: safeDir, title,
      tags, ext, subtype: reg?.subtype ?? "other", actions,
      enabled: true, rule: rule.id, note: rule.note,
    };
    if (EXCLUDE_NAME_RE.test(name)) {
      item.enabled = false;
      item.reason = "疑似密钥/凭据文件，按 B1 排除规则不整理";
    } else if (!reg) {
      // 物理存在但未登记：仍可整理，只是没有索引记录（如实标注）
      item.note += "；未在站内登记索引（外部放入）";
    } else if (reg.status !== "unsorted") {
      item.enabled = false;
      item.reason = `文件状态为 ${reg.status}，不是待整理状态`;
    }
    items.push(item);
  }

  const skipped = items.filter((i) => !i.enabled).length;
  return {
    unsorted, root, dirMap, allowedDirs: dirs, rules: getFilingRules(),
    counts: { total: items.length, ready: items.length - skipped, skipped },
    items,
    pending: listFilingProposals().pending,
  };
}

/* ---------------- 保存提案（落库 + 站内消息） ---------------- */

interface RawItem {
  from?: unknown; file_id?: unknown; filename?: unknown; dir?: unknown;
  title?: unknown; tags?: unknown; ext?: unknown; subtype?: unknown;
  actions?: unknown; enabled?: unknown; rule?: unknown; note?: unknown; reason?: unknown;
}

function normalizeItems(input: RawItem[]): FilingItem[] {
  const unsorted = path.resolve(unsortedDir());
  const dirs = allowedDirs();
  return input.map((raw) => {
    const from = path.resolve(String(raw.from ?? ""));
    if (!isUnder(from, unsorted) || from === unsorted) {
      throw new Error(`提案文件不在内部库未分类区内：${from}`);
    }
    const ext = typeof raw.ext === "string" ? raw.ext.toLowerCase() : path.extname(from).toLowerCase();
    const stitle = safeName(String(raw.title ?? path.basename(from, ext)) || "未命名");
    const rawDir = String(raw.dir ?? "笔记");
    // 目录只能取允许集合，防 `../` 越权
    const dir = dirs.includes(rawDir) ? rawDir : "笔记";
    const filename = safeName(String(raw.filename ?? path.basename(from)));
    // 强制保留原扩展名，防伪造扩展名
    const withExt = path.extname(filename).toLowerCase() === ext ? filename : `${path.basename(filename, path.extname(filename))}${ext}`;
    return {
      from, file_id: typeof raw.file_id === "string" ? raw.file_id : "",
      filename: withExt, dir, title: stitle,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string").slice(0, 20) : [],
      ext,
      subtype: raw.subtype === "report" || raw.subtype === "note" ? raw.subtype : "other",
      actions: Array.isArray(raw.actions) ? raw.actions.filter((a) => typeof a === "string").slice(0, 10) : ["移动"],
      enabled: raw.enabled !== false,
      rule: typeof raw.rule === "string" ? raw.rule.slice(0, 40) : "other",
      note: typeof raw.note === "string" ? raw.note.slice(0, 200) : "",
      ...(typeof raw.reason === "string" ? { reason: raw.reason.slice(0, 200) } : {}),
    } satisfies FilingItem;
  });
}

export interface SaveFilingInput {
  items: RawItem[];
  source?: string;
}

/** 保存为提案：过滤已存在 pending 提案里的同文件，发一条站内轻通知 */
export function saveFilingProposal(input: SaveFilingInput): FilingProposal | null {
  const items = normalizeItems(input.items);
  const existing = new Set(
    listFilingProposals("pending").proposals
      .flatMap((p) => p.items.filter((i) => i.enabled).map((i) => path.resolve(i.from).toLowerCase()))
  );
  const fresh = items.filter((i) => i.enabled && !existing.has(path.resolve(i.from).toLowerCase()));
  if (fresh.length === 0) return null;

  const now = nowIso();
  const id = crypto.randomUUID();
  const source = input.source ?? `filing:${Date.now()}`;
  const proposal: FilingProposal = {
    id, status: "pending", items: fresh, source, commit: null,
    counts: { total: fresh.length, enabled: fresh.length, skipped: items.length - fresh.length },
    created_at: now, updated_at: now,
  };
  const { id: _id, created_at: _c, updated_at: _u, ...payload } = proposal;
  getDb().prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'filing_proposal', '', '', ?, 1, ?, ?)`
  ).run(id, JSON.stringify(payload), now, now);

  createMessage({
    kind: "proposal",
    title: `待审批：内部库整理提案（${fresh.length} 个文件）`,
    body: `内部库未分类区有 ${fresh.length} 个文件等待整理。\n`
      + `请到「知识库 → 内部库」查看逐条建议，勾选并确认后才会移动到用户加入的库。\n`
      + `本次为纯规则提案（不调模型、不改非 Markdown 文件内容）。`,
    source: `filing-proposal:${id}`,
  });
  return proposal;
}

export interface FilingPatch { items?: RawItem[]; status?: "rejected" }

export function updateFilingProposal(id: string, patch: FilingPatch): FilingProposal | null {
  const p = getFilingProposal(id);
  if (!p || p.status !== "pending") return null;
  if (patch.status === "rejected") {
    p.status = "rejected";
  } else if (patch.items) {
    p.items = normalizeItems(patch.items);
    p.counts = {
      total: p.items.length,
      enabled: p.items.filter((i) => i.enabled).length,
      skipped: p.items.filter((i) => !i.enabled).length,
    };
  }
  p.updated_at = nowIso();
  saveProposalRow(p);
  return getFilingProposal(id);
}

export function deleteFilingProposal(id: string): boolean {
  const db = getDb();
  if (!getFilingProposal(id)) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'filing_proposal'")
    .run(nowIso(), nowIso(), id);
  return true;
}

/** 验收清理：按 source 前缀删除提案与对应消息 */
export function purgeFilingBySourcePrefix(prefix: string): number {
  const db = getDb();
  const rows = db.prepare("SELECT id, payload FROM items WHERE type = 'filing_proposal'").all() as
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

/* ---------------- 批准执行 ---------------- */

export interface FilingResult {
  ok: true;
  commit: string;
  count: number;
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
  message: string;
  root: string;
}

/** `.md` 专用：程序补 frontmatter 标题 / 标签（其它格式绝不改内容） */
function addFrontmatter(abs: string, title: string, tags: string[]): void {
  if (path.extname(abs).toLowerCase() !== ".md") return;
  const text = fs.readFileSync(abs, "utf-8");
  const lines = text.split(/\r?\n/);
  const hasFm = lines[0]?.trim() === "---";
  let end = -1;
  if (hasFm) {
    for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") { end = i; break; }
  }
  const tagLines = tags.length ? tags.map((t) => `  - "#${t.replace(/^#/, "")}"`) : [];
  if (end !== -1) {
    const hasTitle = lines.slice(1, end).some((l) => /^title\s*:/i.test(l));
    const hasTags = lines.slice(1, end).some((l) => /^tags\s*:/i.test(l));
    const insert: string[] = [];
    if (!hasTitle) insert.push(`title: "${title.replace(/"/g, "'")}"`);
    if (!hasTags && tagLines.length) insert.push("tags:", ...tagLines);
    if (insert.length) lines.splice(end, 0, ...insert);
  } else {
    lines.unshift("---", `title: "${title.replace(/"/g, "'")}"`, ...(tagLines.length ? ["tags:", ...tagLines] : []), "---", "");
  }
  fs.writeFileSync(abs, lines.join("\n"), "utf-8");
}

/** 批准：服务端重算 to → 逐条移动 → 一次 git commit → 更新文件索引 */
export function approveFilingProposal(id: string): { proposal: FilingProposal; result: FilingResult } {
  const p = getFilingProposal(id);
  if (!p) throw new Error("提案不存在");
  if (p.status !== "pending") throw new Error(`提案状态为 ${p.status}，不能重复批准`);

  const cfg = getLibraries();
  const root = path.resolve(cfg.exportVault || TEST_VAULT);
  if (!isUnder(root, TEST_VAULT)) throw new Error("分流目标库不在测试库内（真实库零接触）");
  const unsorted = path.resolve(unsortedDir());
  const dirs = allowedDirs();
  const enabled = p.items.filter((i) => i.enabled);
  if (enabled.length === 0) throw new Error("没有勾选任何条目，无需执行");

  const moved: { from: string; to: string }[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const touched: { fileId: string; to: string; dir: string; filename: string }[] = [];

  for (const item of enabled) {
    const from = path.resolve(item.from);
    if (!isUnder(from, unsorted) || from === unsorted) {
      skipped.push({ path: from, reason: "原文件不在内部库未分类区内" });
      continue;
    }
    if (!fs.existsSync(from)) {
      skipped.push({ path: from, reason: "原文件已不存在（可能已被整理）" });
      continue;
    }
    const dir = dirs.includes(item.dir) ? item.dir : "笔记";
    // 文件名强制安全化 + 保留原扩展名（不信任客户端）
    const ext = path.extname(from).toLowerCase();
    const stem = path.basename(safeName(item.filename), path.extname(item.filename));
    const filename = `${stem}${ext}`;
    const to = path.resolve(path.join(root, dir, filename));
    if (!isUnder(to, root) || to === root) {
      skipped.push({ path: from, reason: "目标路径越出用户库" });
      continue;
    }
    if (fs.existsSync(to) && path.resolve(to) !== from) {
      skipped.push({ path: from, reason: "目标位置已有同名文件，不覆盖" });
      continue;
    }
    const lock = isLocked(from);
    if (lock.locked) {
      skipped.push({ path: from, reason: lock.reason ?? "文件被占用" });
      continue;
    }
    try {
      if (item.actions.includes("补标题/标签")) addFrontmatter(from, item.title, item.tags);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      moved.push({ from, to });
      if (item.file_id) touched.push({ fileId: item.file_id, to, dir, filename });
    } catch (e) {
      skipped.push({ path: from, reason: `操作失败：${(e as Error).message}` });
    }
  }

  if (moved.length === 0) throw new Error("没有文件被实际整理（可能全部被占用或跳过）");

  ensureRepo(root);
  // 只暂存本次目标路径；内部库原路径不在 git 仓库内，无需（也不能）add
  const paths = moved.map((m) => m.to).filter((p2) => fs.existsSync(p2));
  for (let i = 0; i < paths.length; i += 40) {
    const add = git(root, ["add", "-A", "--", ...paths.slice(i, i + 40)]);
    if (!add.ok) throw new Error(`git add 失败：${add.err || add.out}`);
  }
  const message = `内部库分流 ${fmtDate(new Date())}（${moved.length} 个文件）`;
  const commit = git(root, [
    "-c", "user.name=Fold_归匣", "-c", "user.email=fold@local", "commit", "-m", message,
  ]);
  if (!commit.ok) throw new Error(`git commit 失败：${commit.err || commit.out}`);
  const hash = git(root, ["rev-parse", "--short", "HEAD"]).out;

  for (const t of touched) {
    updateFile(t.fileId, {
      path: t.to, filename: t.filename, dir: t.dir,
      status: "filed", commit: hash, filed_at: nowIso(),
    });
  }

  p.status = "approved";
  p.commit = hash;
  p.updated_at = nowIso();
  saveProposalRow(p);

  return {
    proposal: getFilingProposal(id)!,
    result: { ok: true, commit: hash, count: moved.length, moved, skipped, message, root },
  };
}

/** 未登记的物理文件清理（验收用）：只删内部库未分类区，绝不动用户库 */
export function purgeUnsortedFiles(names: string[]): number {
  const dir = unsortedDir();
  let n = 0;
  for (const name of names) {
    const abs = path.join(dir, path.basename(name));
    if (!isUnder(abs, dir)) continue;
    try { fs.rmSync(abs, { force: true }); n++; } catch { /* ignore */ }
  }
  return n;
}
