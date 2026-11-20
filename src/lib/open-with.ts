/**
 * 文件打开方式映射（三期 C3 第 2 轮）
 *
 * - 默认：.md / .html / .htm / .pdf → Obsidian；其它格式 → 系统默认应用
 *   （HTML 走 Obsidian 是用户 2026-11-20 明确拍板；Obsidian 本体不原生渲染 HTML，
 *     需社区插件，库名未配置或链接不可生成时服务端回退系统打开并如实标注）
 * - 可手动改，也可让管家改；纳入 L0 注册表共用校验
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";

export type OpenMode = "obsidian" | "system";

export interface OpenWithConfig {
  version: 1;
  obsidian_exts: string[];
  default: OpenMode;
  updated_at: string | null;
}

export const DEFAULT_OPEN_WITH: OpenWithConfig = {
  version: 1,
  obsidian_exts: [".md", ".html", ".htm", ".pdf"],
  default: "system",
  updated_at: null,
};

export interface OpenWithValue { obsidian_exts: string[]; default: OpenMode; }

function configPath(): string { return path.join(getDataDir(), "open-with.json"); }

export function getOpenWith(): OpenWithConfig {
  try {
    const p = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Partial<OpenWithConfig>;
    if (p.version === 1) {
      const v = validateOpenWith(p);
      if (v.ok) {
        return { version: 1, obsidian_exts: v.value.obsidian_exts, default: v.value.default,
          updated_at: typeof p.updated_at === "string" ? p.updated_at : null };
      }
    }
  } catch { /* 不存在或损坏 → 默认 */ }
  return { ...DEFAULT_OPEN_WITH, obsidian_exts: [...DEFAULT_OPEN_WITH.obsidian_exts] };
}

export function setOpenWith(value: OpenWithValue): OpenWithConfig {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const cfg: OpenWithConfig = {
    version: 1,
    obsidian_exts: value.obsidian_exts,
    default: value.default,
    updated_at: new Date().toISOString(),
  };
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return cfg;
}

export function validateOpenWith(input: unknown): {
  ok: boolean; value: OpenWithValue; errors: string[];
} {
  const errors: string[] = [];
  const raw = (input ?? {}) as Record<string, unknown>;
  const exts: string[] = [];
  if (!Array.isArray(raw.obsidian_exts)) errors.push("obsidian_exts 必须是数组");
  else for (const e of raw.obsidian_exts) {
    if (typeof e !== "string") { errors.push("扩展名必须是字符串"); continue; }
    const x = e.trim().toLowerCase();
    if (!/^\.[a-z0-9]{1,10}$/.test(x)) errors.push(`非法扩展名：${e}`);
    else if (!exts.includes(x)) exts.push(x);
  }
  if (exts.length > 50) errors.push("扩展名最多 50 个");
  const d = raw.default ?? getOpenWith().default;
  if (d !== "obsidian" && d !== "system") errors.push("default 只能是 obsidian 或 system");
  return { ok: errors.length === 0, value: { obsidian_exts: exts, default: d as OpenMode }, errors };
}

export function openModeFor(ext: string, cfg = getOpenWith()): OpenMode {
  return cfg.obsidian_exts.includes(ext.toLowerCase()) ? "obsidian" : cfg.default;
}
