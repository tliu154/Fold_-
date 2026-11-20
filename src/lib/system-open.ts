/**
 * 本机系统打开（三期 C3 第 2 轮）
 *
 * 浏览器不能直调本地应用 → 由本机服务端带鉴权的接口调起：
 * - 文件：按「打开方式映射」决定走 Obsidian（返回 obsidian:// 由前端跳转）
 *   或系统默认应用（服务端 PowerShell Invoke-Item，等价资源管理器双击）
 * - 文件夹：服务端调起系统文件管理器
 *
 * 安全（这是本轮最要紧的红线）：
 * - **只接受「已加入的库根 + 库内相对路径」**，绝对路径也必须在某个库根内
 * - 按段比较 `isUnder()`，不用 startsWith（测试库与真实库前缀相近会误判）
 * - 排除隐藏目录 / 密钥文件名 / 项目自身 develop/Fold_
 * - 客户端不能塞任意路径；服务端重算绝对路径并 statSync 确认存在
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { getLibraries } from "./libraries";
import { isUnder } from "./tidy";
import { EXCLUDE_NAME_RE, buildObsidianUri } from "./files";
import { openModeFor, type OpenMode } from "./open-with";

const EXCLUDE_DIRS = new Set([
  ".git", ".obsidian", ".trash", "node_modules", ".next", "__pycache__", ".venv", "venv",
]);
const SELF_DIR_RE = /[\\/]develop[\\/]Fold_?(?:[\\/]|$)/i;

/** 允许打开的根 = 网站里加入的库（knowledgeDirs），不额外引入别处路径 */
export function libraryRoots(): string[] {
  const cfg = getLibraries();
  return Array.from(new Set(
    cfg.knowledgeDirs.filter((r) => typeof r === "string" && r.trim()).map((r) => path.resolve(r)),
  ));
}

export interface OpenTarget {
  abs: string;
  rel: string;
  root: string;
  kind: "file" | "folder";
  ext: string;
  mode: OpenMode;
  obsidianUri: string | null;
  fallback: string | null;
}

export interface ResolveInput {
  path?: unknown;
  rel?: unknown;
  root?: unknown;
  kind?: unknown;
}

/** 解析并校验打开目标；任何越权都返回 null */
export function resolveOpenTarget(input: ResolveInput): OpenTarget | null {
  const roots = libraryRoots();
  if (roots.length === 0) return null;
  let abs: string | null = null;
  let root = "";

  if (typeof input.rel === "string" && input.rel.trim()) {
    const rel = input.rel.replace(/\\/g, "/");
    if (rel.startsWith("/") || /^[a-z]:/i.test(rel) || rel.split("/").includes("..")) return null;
    // 指定 root 时只在该根下找；没指定就遍历所有已加入的库
    const candidates = typeof input.root === "string" && input.root.trim()
      ? roots.filter((r) => r.toLowerCase() === path.resolve(input.root as string).toLowerCase())
      : roots;
    for (const r of candidates) {
      const cand = path.resolve(r, rel);
      if (isUnder(cand, r) && cand !== r && fs.existsSync(cand)) { abs = cand; root = r; break; }
    }
  } else if (typeof input.path === "string" && input.path.trim()) {
    const cand = path.resolve(input.path);
    const r = roots.find((rr) => isUnder(cand, rr) && cand !== rr);
    if (r) { abs = cand; root = r; }
  }
  if (!abs || !root) return null;

  const rel = path.relative(root, abs).replace(/\\/g, "/");
  const segs = rel.split("/");
  if (segs.some((s) => s.startsWith(".") || EXCLUDE_DIRS.has(s))) return null;
  if (SELF_DIR_RE.test("/" + rel)) return null;
  if (EXCLUDE_NAME_RE.test(path.basename(abs))) return null;

  let st: fs.Stats;
  try { st = fs.statSync(abs); } catch { return null; }
  const kind: "file" | "folder" | null = st.isDirectory() ? "folder" : st.isFile() ? "file" : null;
  if (!kind) return null;

  const ext = path.extname(abs).toLowerCase();
  const cfg = getLibraries();
  const mode: OpenMode = kind === "file" ? openModeFor(ext) : "system";
  let obsidianUri: string | null = null;
  let fallback: string | null = null;
  if (kind === "file" && mode === "obsidian") {
    obsidianUri = buildObsidianUri(abs, cfg.obsidianVault, cfg.knowledgeDirs);
    if (!obsidianUri) {
      fallback = "obsidian_unavailable";
    }
  }
  return { abs, rel, root, kind, ext, mode, obsidianUri, fallback };
}

/**
 * 向系统发起打开请求（异步，不等待外部应用退出）。
 * 浏览器无法确认外部应用是否真的启动成功，所以接口只如实返回「已发起请求」。
 */
export function launchSystem(abs: string, kind: "file" | "folder"): { launched: boolean; via: string; error?: string } {
  if (process.platform !== "win32") {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(cmd, [abs], { windowsHide: true }, () => { /* 不阻塞 */ });
    return { launched: true, via: cmd };
  }
  const ps = `Invoke-Item -LiteralPath '${abs.replace(/'/g, "''")}'`;
  try {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { windowsHide: true, timeout: 15000 },
      () => { /* 不阻塞：外部应用可能长时间不退出 */ },
    );
    return { launched: true, via: kind === "folder" ? "explorer (Invoke-Item)" : "系统默认应用 (Invoke-Item)" };
  } catch (e) {
    return { launched: false, via: "", error: (e as Error).message };
  }
}
