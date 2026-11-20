/**
 * 项目库进度看板（二期 B1）
 * - 扫项目库目录下每个子项目的 STATUS.md，只读解析固定格式（P7：不猜 README）
 * - 格式：一行 progress: 60% + checkbox 列表（- [x] / - [ ]）
 * - 不改文件、不猜自由格式、不做 git（二期后续轮次）
 */
import fs from "node:fs";
import path from "node:path";
import { getLibraries } from "./libraries";

export interface ProjectProgress {
  name: string;
  path: string;
  hasStatus: boolean;
  progress: number | null;
  tasks: { done: number; total: number };
  updated_at: string | null;
}

function parseStatus(content: string): { progress: number | null; done: number; total: number } {
  const pm = content.match(/^\s*progress\s*:\s*(\d{1,3})\s*%?\s*$/im);
  const progress = pm ? Math.min(100, Math.max(0, Number(pm[1]))) : null;
  let done = 0, total = 0;
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+\[([ xX])\]/);
    if (m) { total++; if (m[1].toLowerCase() === "x") done++; }
  }
  return { progress, done, total };
}

export function listProjects(): { projects: ProjectProgress[]; dirs: string[] } {
  const cfg = getLibraries();
  const projects: ProjectProgress[] = [];
  for (const root of cfg.projectDirs) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    let names: string[];
    try { names = fs.readdirSync(root); }
    catch { continue; }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const p = path.join(root, name);
      try { if (!fs.statSync(p).isDirectory()) continue; } catch { continue; }
      const statusPath = path.join(p, "STATUS.md");
      let item: ProjectProgress = {
        name, path: p, hasStatus: false, progress: null,
        tasks: { done: 0, total: 0 }, updated_at: null,
      };
      if (fs.existsSync(statusPath)) {
        try {
          const content = fs.readFileSync(statusPath, "utf-8");
          const parsed = parseStatus(content);
          const st = fs.statSync(statusPath);
          item = {
            ...item, hasStatus: true, progress: parsed.progress,
            tasks: { done: parsed.done, total: parsed.total },
            updated_at: st.mtime.toISOString(),
          };
        } catch { /* 读失败则按无 STATUS 处理 */ }
      }
      projects.push(item);
    }
  }
  projects.sort((a, b) => {
    if (a.hasStatus !== b.hasStatus) return a.hasStatus ? -1 : 1;
    return (b.progress ?? -1) - (a.progress ?? -1);
  });
  return { projects, dirs: cfg.projectDirs };
}
