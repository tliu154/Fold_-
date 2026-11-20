/**
 * 统一资源库配置（二期 B1，B2 增补 obsidianVault，B3 增补 inboxDir + tidy）
 * - 一份 data/libraries.json 统一管理：知识库目录(多个)、项目库目录、检索白名单、导出目标、Obsidian 库名、未整理暂存区
 * - 收敛 A8(index-config.json) 与 A10(capture-config.json)：首次若旧文件存在则读入一次，不删旧文件
 * - 不新增表；配置存本地 JSON（data/ 已被 git 忽略）
 * - 默认全部指向测试目录，绝不碰真实知识库（用户 2026-11-20 明确要求）
 * - B2：obsidianVault 默认空串（不擅自猜库名），用户注册 vault 后自行填写；空串时跳转链接禁用
 * - B3：inboxDir = 未整理暂存区（默认 D:\我的知识库测试\未整理）；
 *       tidy 三种可逆操作的开关，默认只开「移动 + 重命名」，「打标签」默认关闭
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";

export const TEST_VAULT = "D:\\我的知识库测试";
export const TEST_PROJECTS = "D:\\我的知识库测试\\项目库";
export const TEST_INBOX = "D:\\我的知识库测试\\未整理";

/** B3：整理时可执行的三种可逆操作（打标签默认关闭） */
export interface TidyOptions {
  move: boolean;
  rename: boolean;
  tag: boolean;
}

export interface LibrariesConfig {
  version: 1;
  knowledgeDirs: string[];   // 知识库目录（多个）
  projectDirs: string[];     // 项目库目录
  indexDirs: string[];       // A8 检索白名单（收敛）
  exportVault: string;       // A10 导出目标（收敛）
  dirMap: Record<string, string>; // A10 导出目录映射（收敛）
  obsidianVault: string;     // B2：Obsidian 库名（obsidian:// 跳转用，默认为空）
  inboxDir: string;          // B3：未整理暂存区（只处理这里的「新文件」）
  tidy: TidyOptions;         // B3：三种可逆操作开关
  updated_at: string | null;
}

function configPath(): string { return path.join(getDataDir(), "libraries.json"); }
function nowIso(): string { return new Date().toISOString(); }

function defaults(): LibrariesConfig {
  return {
    version: 1,
    knowledgeDirs: [TEST_VAULT],
    projectDirs: [TEST_PROJECTS],
    indexDirs: [TEST_VAULT],
    exportVault: TEST_VAULT,
    dirMap: {
      "course/": "课件和教材", "topic/": "笔记", "source/": "资源库", "type/": "笔记",
    },
    obsidianVault: "",
    inboxDir: TEST_INBOX,
    tidy: { move: true, rename: true, tag: false },
    updated_at: null,
  };
}

/** 从 A8 / A10 旧配置迁移一次（只读，不删旧文件） */
function legacy(): Partial<LibrariesConfig> {
  const out: Partial<LibrariesConfig> = {};
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(getDataDir(), "index-config.json"), "utf-8")) as { dirs?: string[] };
    if (Array.isArray(idx.dirs) && idx.dirs.length) {
      const safe = idx.dirs.filter((d) => !d.includes("develop") && !d.includes("Fold_"));
      if (safe.length) out.indexDirs = safe;
      if (!out.knowledgeDirs) out.knowledgeDirs = safe;
    }
  } catch { /* 无旧配置 */ }
  try {
    const cap = JSON.parse(fs.readFileSync(path.join(getDataDir(), "capture-config.json"), "utf-8")) as {
      vault?: string; dirMap?: Record<string, string>;
    };
    if (typeof cap.vault === "string" && !cap.vault.includes("develop")) out.exportVault = cap.vault;
    if (cap.dirMap && typeof cap.dirMap === "object") out.dirMap = cap.dirMap;
  } catch { /* 无旧配置 */ }
  return out;
}

export function getLibraries(): LibrariesConfig {
  const p = configPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<LibrariesConfig>;
    if (parsed.version === 1) {
      const d = defaults();
      return {
        version: 1,
        knowledgeDirs: Array.isArray(parsed.knowledgeDirs) ? parsed.knowledgeDirs : d.knowledgeDirs,
        projectDirs: Array.isArray(parsed.projectDirs) ? parsed.projectDirs : d.projectDirs,
        indexDirs: Array.isArray(parsed.indexDirs) ? parsed.indexDirs : d.indexDirs,
        exportVault: typeof parsed.exportVault === "string" ? parsed.exportVault : d.exportVault,
        dirMap: parsed.dirMap && typeof parsed.dirMap === "object" ? parsed.dirMap : d.dirMap,
        obsidianVault: typeof parsed.obsidianVault === "string" ? parsed.obsidianVault : d.obsidianVault,
        // B3：旧配置没有这两个字段 → 用默认值（打标签仍默认关闭）
        inboxDir: typeof parsed.inboxDir === "string" && parsed.inboxDir.trim() ? parsed.inboxDir : d.inboxDir,
        tidy: {
          move: typeof parsed.tidy?.move === "boolean" ? parsed.tidy.move : d.tidy.move,
          rename: typeof parsed.tidy?.rename === "boolean" ? parsed.tidy.rename : d.tidy.rename,
          tag: typeof parsed.tidy?.tag === "boolean" ? parsed.tidy.tag : d.tidy.tag,
        },
        updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : null,
      };
    }
  } catch { /* 不存在或损坏 → 首次迁移/默认 */ }
  const merged: LibrariesConfig = { ...defaults(), ...legacy(), updated_at: nowIso() };
  setLibraries(merged);
  return merged;
}

export function setLibraries(cfg: Omit<LibrariesConfig, "version" | "updated_at">): LibrariesConfig {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const next: LibrariesConfig = { ...cfg, version: 1, updated_at: nowIso() };
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, p);

  // 同步写回 A8 / A10 旧配置，保持既有功能读到同一份值（不删旧文件）
  try {
    fs.writeFileSync(
      path.join(getDataDir(), "index-config.json"),
      JSON.stringify({ dirs: next.indexDirs }, null, 2), "utf-8"
    );
    fs.writeFileSync(
      path.join(getDataDir(), "capture-config.json"),
      JSON.stringify({ vault: next.exportVault, dirMap: next.dirMap }, null, 2), "utf-8"
    );
  } catch { /* 同步失败不影响主配置 */ }
  return next;
}
