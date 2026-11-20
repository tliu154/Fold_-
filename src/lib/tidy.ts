/**
 * 暂存区整理（二期 B3）
 *
 * 干什么：把「未整理」暂存区（默认 D:\我的知识库测试\未整理）里的新笔记，
 * 按 frontmatter 标签映射到知识库正确目录，并把文件名规范成 `YYYY-MM-DD_标题.md`，
 * 一次整理 = 一次 git commit，commit hash + 文件清单写进 data/tidy-log.json 作回滚记录。
 *
 * 三种可逆操作（开关在 data/libraries.json 的 tidy）：
 *   move   移动：按标签映射目录（复用 A10 的 resolveExportDir，不另写一套）
 *   rename 重命名：YYYY-MM-DD_标题.md
 *   tag    打标签：补 `#type/笔记`（**默认关闭**）
 *
 * 硬约束：
 * - 只处理「未整理目录」里的 .md；不调模型、不读正文存库、不改 Obsidian 配置
 * - 未整理目录必须在测试知识库 D:\我的知识库测试 内，真实知识库零接触
 * - 先预览、点确认才执行；执行前后校验 git 工作区干净（有未提交改动就暂停）
 * - git init 只在这里发生，且只对测试库；真实库绝不 init
 * - 逐文件独占打开检测占用后跳过并报告（Windows 上配合 Office 锁文件才 100% 准，
 *   这里只能尽力而为：拿不到写句柄即视为占用，可能漏判，报告里如实说明）
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getDataDir } from "./config";
import { getLibraries, TEST_VAULT, type TidyOptions } from "./libraries";
import { readMdMeta, EXCLUDE_NAME_RE } from "./files";
import { resolveExportDir, TYPE_TAG } from "./capture";

const LOG_FILE = "tidy-log.json";
const LOG_LIMIT = 200;
const SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".next", "__pycache__", ".venv", "venv"]);

/* ---------------- 路径工具 ---------------- */

function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
function isUnder(child: string, parent: string): boolean {
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p + "/");
}
/**
 * 安全检查：锚点目录必须在测试知识库内。
 * 真实库（D:\我的知识库）与测试库（D:\我的知识库测试）前缀相近，必须按段比较，
 * 不能用 startsWith("D:\\我的知识库") 这种粗判断，否则测试库会被误判、真实库会被误放行。
 */
function assertTestOnly(target: string, label: string): void {
  if (!isUnder(target, TEST_VAULT)) {
    throw new Error(`${label}必须位于测试知识库 ${TEST_VAULT} 内（真实知识库零接触）`);
  }
}
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\r\n\t]/g, "_").replace(/\s+/g, " ").trim().slice(0, 60) || "未命名";
}

/* ---------------- git 工具 ---------------- */

function git(root: string, args: string[]): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync("git", ["-C", root, ...args], {
      encoding: "utf-8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: (out ?? "").trim(), err: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      out: String(err.stdout ?? "").trim(),
      err: String(err.stderr ?? err.message ?? "").trim(),
    };
  }
}
function isRepo(root: string): boolean {
  return fs.existsSync(path.join(root, ".git"));
}
function hasCommit(root: string): boolean {
  return isRepo(root) && git(root, ["rev-parse", "--verify", "HEAD"]).ok;
}
/**
 * 工作区未提交改动清单（相对仓库根的路径）
 * 排除「未整理目录」本身：那里的新文件正是本次要处理的输入，天然是未跟踪状态，
 * 若算进脏检查就永远无法整理；未整理目录之外的任何改动都要暂停。
 */
function dirtyFiles(root: string, inbox: string): string[] {
  if (!hasCommit(root)) return [];
  // core.quotepath=false 让中文路径按原样输出，便于前端直接展示
  const r = git(root, ["-c", "core.quotepath=false", "status", "--porcelain"]);
  if (!r.ok || !r.out) return [];
  const inboxRel = path.relative(root, inbox).replace(/\\/g, "/").replace(/\/+$/, "");
  return r.out.split(/\r?\n/).filter(Boolean).filter((line) => {
    const rest = line.slice(3);
    const target = rest.includes(" -> ") ? rest.split(" -> ").pop()!.trim() : rest.trim();
    const p = target.replace(/^"|"$/g, "");
    return !(p === inboxRel || p.startsWith(`${inboxRel}/`));
  }).slice(0, 50);
}
/** 首次整理时初始化仓库——唯一允许 git init 的地方，且只对测试库 */
function ensureRepo(root: string): { inited: boolean } {
  assertTestOnly(root, "整理仓库根目录");
  if (isRepo(root)) return { inited: false };
  const r = git(root, ["init"]);
  if (!r.ok) throw new Error(`git init 失败：${r.err || r.out}`);
  return { inited: true };
}

/* ---------------- 文件占用检测 ---------------- */

/**
 * 能否拿到独占写句柄。拿不到（EBUSY/EPERM/EACCES）就当作被其它程序打开。
 * 说明：Windows 上仅能覆盖「持有写锁」的场景，不保证 100% 准确。
 */
export function isLocked(abs: string): { locked: boolean; reason?: string } {
  try {
    const fd = fs.openSync(abs, "r+");
    fs.closeSync(fd);
    return { locked: false };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      return { locked: true, reason: `文件被占用或不可写（${code}）` };
    }
    return { locked: true, reason: `无法以写方式打开（${code || "未知错误"}）` };
  }
}

/* ---------------- 扫描与预览 ---------------- */

export interface TidyItem {
  from: string;              // 当前绝对路径
  to: string;                // 目标绝对路径
  filename: string;          // 目标文件名
  dir: string;               // 目标子目录（相对知识库根）
  title: string;
  tags: string[];
  actions: string[];         // 移动 / 重命名 / 打标签
  status: "ready" | "skip";
  reason?: string;
}

export interface TidyPreview {
  inbox: string;
  inboxExists: boolean;
  root: string;
  options: TidyOptions;
  repo: boolean;
  hasCommit: boolean;
  dirty: boolean;
  dirtyFiles: string[];
  canRun: boolean;
  blockedReason?: string;
  counts: { total: number; ready: number; skipped: number };
  items: TidyItem[];
  last: TidyLogRecord | null;
}

export interface TidyLogRecord {
  at: string;
  commit: string;
  count: number;
  message: string;
  inited: boolean;
  options: TidyOptions;
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

function readLog(): TidyLogRecord[] {
  try {
    const raw = fs.readFileSync(path.join(getDataDir(), LOG_FILE), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as TidyLogRecord[];
    return [];
  } catch { return []; }
}

export function getLastTidy(): TidyLogRecord | null {
  return readLog()[0] ?? null;
}

/** C1：供「每周数据小结」统计整理次数（只读，不触发整理） */
export function listTidyLog(): TidyLogRecord[] {
  return readLog();
}

/** C1：供「未整理目录巡检」只读统计待整理 .md（绝不自动整理、不 init git、不写文件） */
export function countInboxMd(): { dir: string; exists: boolean; md: string[] } {
  const inbox = getInboxDir();
  const exists = fs.existsSync(inbox) && fs.statSync(inbox).isDirectory();
  const raw: string[] = [];
  if (exists) walkInbox(inbox, raw);
  const md = raw
    .filter((f) => !EXCLUDE_NAME_RE.test(path.basename(f)))
    .filter((f) => path.extname(f).toLowerCase() === ".md")
    .map((f) => path.basename(f));
  return { dir: inbox, exists, md };
}

function appendLog(record: TidyLogRecord): void {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const next = [record, ...readLog()].slice(0, LOG_LIMIT);
  const p = path.join(dir, LOG_FILE);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

/** 未整理目录（绝对路径，已做测试库校验） */
export function getInboxDir(): string {
  const cfg = getLibraries();
  const inbox = path.resolve(cfg.inboxDir);
  assertTestOnly(inbox, "未整理目录");
  return inbox;
}

/** 目标知识库根：取包含未整理目录的最具体知识库目录，没有则用测试库根 */
function targetRoot(inbox: string): string {
  const cfg = getLibraries();
  const match = cfg.knowledgeDirs
    .filter((r) => typeof r === "string" && r.trim())
    .filter((r) => isUnder(inbox, r))
    .sort((a, b) => norm(b).length - norm(a).length)[0];
  const root = path.resolve(match ?? TEST_VAULT);
  assertTestOnly(root, "目标知识库根");
  return root;
}

/** 递归列出未整理目录内的文件（跳过隐藏/排除目录） */
function walkInbox(dir: string, out: string[]): void {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    let st: fs.Stats;
    try { st = fs.statSync(abs); } catch { continue; }
    if (st.isDirectory()) walkInbox(abs, out);
    else if (st.isFile()) out.push(abs);
  }
}

/** 读文件日期：frontmatter created 优先，否则用文件修改时间 */
function fileDate(abs: string, created?: string): string {
  if (created && /^\d{4}-\d{2}-\d{2}$/.test(created)) return created;
  try { return fmtDate(fs.statSync(abs).mtime); } catch { return fmtDate(new Date()); }
}

/** 生成预览（纯读：不移动、不改名、不打标签、不 init git） */
export function previewTidy(): TidyPreview {
  const cfg = getLibraries();
  const inbox = getInboxDir();
  const root = targetRoot(inbox);
  const inboxExists = fs.existsSync(inbox) && fs.statSync(inbox).isDirectory();
  const options = cfg.tidy;
  const repo = isRepo(root);
  const baseline = repo && hasCommit(root); // 有基线提交才能判断「有未提交改动」
  const dirtyList = baseline ? dirtyFiles(root, inbox) : [];

  const items: TidyItem[] = [];
  const rawFiles: string[] = [];
  if (inboxExists) walkInbox(inbox, rawFiles);

  for (const from of rawFiles) {
    const base = path.basename(from);
    const ext = path.extname(from).toLowerCase();
    if (EXCLUDE_NAME_RE.test(base)) {
      items.push({
        from, to: from, filename: base, dir: "", title: base,
        tags: [], actions: [], status: "skip",
        reason: "疑似密钥/凭据文件，沿用 B1 排除规则不整理",
      });
      continue;
    }
    if (ext !== ".md") {
      items.push({
        from, to: from, filename: base, dir: "", title: base,
        tags: [], actions: [], status: "skip",
        reason: "非 .md 文件，本期不整理（不做 OCR / 不猜分类）",
      });
      continue;
    }
    const meta = readMdMeta(from);
    const tags = meta.tags ?? [];
    const title = (meta.fm_title || meta.title || path.basename(base, ext)).trim() || "未命名";
    const dir = resolveExportDir(tags, cfg.dirMap);
    const filename = `${fileDate(from, meta.created)}_${safeName(title)}.md`;

    const actions: string[] = [];
    const targetDirAbs = options.move ? path.join(root, dir) : path.dirname(from);
    const to = path.join(targetDirAbs, filename);
    if (options.move && norm(targetDirAbs) !== norm(path.dirname(from))) actions.push("移动");
    if (options.rename && filename !== base) actions.push("重命名");
    if (options.tag && !tags.some((t) => t.startsWith("type/"))) actions.push("打标签");

    const item: TidyItem = { from, to, filename, dir, title, tags, actions, status: "ready" };
    if (actions.length === 0) {
      item.status = "skip";
      item.reason = "已在目标位置且命名规范，无需处理";
    } else if (norm(to) !== norm(from) && fs.existsSync(to)) {
      item.status = "skip";
      item.reason = "目标位置已有同名文件，不覆盖";
    } else {
      const lock = isLocked(from);
      if (lock.locked) {
        item.status = "skip";
        item.reason = lock.reason ?? "文件被占用";
      }
    }
    items.push(item);
  }

  const ready = items.filter((i) => i.status === "ready").length;
  const skipped = items.length - ready;
  let blockedReason: string | undefined;
  if (!inboxExists) blockedReason = `未整理目录不存在：${inbox}（新建该目录并放入 .md 后再试）`;
  else if (dirtyList.length > 0) blockedReason = "知识库有未提交改动，先提交/还原再整理（避免混进同一次 commit）";
  else if (ready === 0) blockedReason = rawFiles.length === 0 ? "未整理目录里没有文件" : "没有可整理的文件（原因见下方清单）";

  return {
    inbox, inboxExists, root, options,
    repo, hasCommit: baseline, dirty: dirtyList.length > 0, dirtyFiles: dirtyList,
    canRun: !blockedReason && ready > 0,
    blockedReason,
    counts: { total: items.length, ready, skipped },
    items,
    last: getLastTidy(),
  };
}

/* ---------------- 执行整理 ---------------- */

export interface TidyResult {
  ok: true;
  commit: string;
  count: number;
  message: string;
  inited: boolean;
  root: string;
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

/** 补 `#type/笔记`（仅在 tidy.tag 开启时调用；写坏也能靠 git 还原） */
function addTypeTag(abs: string): void {
  const text = fs.readFileSync(abs, "utf-8");
  const lines = text.split(/\r?\n/);
  if (lines.some((l) => l.includes(`#${TYPE_TAG}`))) return;

  let end = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") { end = i; break; }
    }
  }
  if (end === -1) {
    // 没有 frontmatter → 在最前面补一个
    fs.writeFileSync(abs, ["---", "tags:", `  - "#${TYPE_TAG}"`, "---", "", ...lines].join("\n"), "utf-8");
    return;
  }
  const idx = lines.findIndex((l, i) => i > 0 && i < end && /^tags\s*:/i.test(l));
  if (idx !== -1) {
    const inline = lines[idx].match(/^(\s*tags\s*:\s*)\[(.*)\]\s*$/i);
    if (inline) {
      const inner = inline[2].trim();
      lines[idx] = `${inline[1]}[${inner ? `${inner}, ` : ""}"#${TYPE_TAG}"]`;
    } else if (/^tags\s*:\s*\S+/i.test(lines[idx]) && !/^tags\s*:\s*$/i.test(lines[idx])) {
      const scalar = lines[idx].replace(/^tags\s*:\s*/i, "").trim();
      lines[idx] = `tags: [${scalar}, "#${TYPE_TAG}"]`;
    } else {
      lines.splice(idx + 1, 0, `  - "#${TYPE_TAG}"`);
    }
  } else {
    lines.splice(end, 0, "tags:", `  - "#${TYPE_TAG}"`);
  }
  fs.writeFileSync(abs, lines.join("\n"), "utf-8");
}

/** 执行整理：预览 → 移动/重命名/打标签 → git add + commit → 写 tidy-log.json */
export function runTidy(): TidyResult {
  const preview = previewTidy();
  if (!preview.canRun) throw new Error(preview.blockedReason ?? "当前无法整理");

  const root = preview.root;
  const { inited } = ensureRepo(root);

  const moved: { from: string; to: string }[] = [];
  const skipped: { path: string; reason: string }[] = preview.items
    .filter((i) => i.status === "skip")
    .map((i) => ({ path: i.from, reason: i.reason ?? "跳过" }));

  for (const item of preview.items) {
    if (item.status !== "ready") continue;
    // 执行前再查一次占用（预览到确认之间可能被打开）
    const lock = isLocked(item.from);
    if (lock.locked) {
      skipped.push({ path: item.from, reason: lock.reason ?? "文件被占用" });
      continue;
    }
    try {
      if (item.actions.includes("打标签")) addTypeTag(item.from);
      fs.mkdirSync(path.dirname(item.to), { recursive: true });
      if (fs.existsSync(item.to) && norm(item.to) !== norm(item.from)) {
        skipped.push({ path: item.from, reason: "目标位置已有同名文件，不覆盖" });
        continue;
      }
      fs.renameSync(item.from, item.to);
      moved.push({ from: item.from, to: item.to });
    } catch (e) {
      skipped.push({ path: item.from, reason: `操作失败：${(e as Error).message}` });
    }
  }

  if (moved.length === 0) {
    throw new Error("没有文件被实际整理（可能全部被占用或跳过）");
  }

  // 只暂存本次涉及的文件（不把整个知识库 add 进来）
  // 说明：移动后 from 已不存在，git add 会因 pathspec 不匹配报错，因此只 add 仍存在的路径
  const paths = moved.flatMap((m) => [m.from, m.to]).filter((p) => fs.existsSync(p));
  for (let i = 0; i < paths.length; i += 40) {
    const chunk = paths.slice(i, i + 40);
    const add = git(root, ["add", "-A", "--", ...chunk]);
    if (!add.ok) throw new Error(`git add 失败：${add.err || add.out}`);
  }

  const message = `整理未整理笔记 ${fmtDate(new Date())}（${moved.length} 个文件）`;
  const commit = git(root, [
    "-c", "user.name=Fold_归匣", "-c", "user.email=fold@local",
    "commit", "-m", message,
  ]);
  if (!commit.ok) throw new Error(`git commit 失败：${commit.err || commit.out}`);
  const hash = git(root, ["rev-parse", "--short", "HEAD"]).out;

  const record: TidyLogRecord = {
    at: new Date().toISOString(),
    commit: hash,
    count: moved.length,
    message,
    inited,
    options: preview.options,
    moved,
    skipped,
  };
  try { appendLog(record); } catch { /* 日志写失败不影响整理结果 */ }

  return { ok: true, commit: hash, count: moved.length, message, inited, root, moved, skipped };
}
