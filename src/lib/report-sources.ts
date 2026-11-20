/**
 * 周报数据源开关面板（三期 C3 第 1 轮）
 *
 * 干什么：用户勾选哪些站内数据源进入周报；程序把勾选源**填数**成结构化数据。
 * 清单 2.2 六类候选源；站内源与 Qwen 资讯（外部源）严格不混。
 *
 * 硬约束：
 * - **AI 不生成/修改任何数字**：本文件只做程序统计，产出交给 reports.ts 拼进 HTML，
 *   再整包喂给模型写「定性评述」；模型拿不到也改不了这些数字
 * - 「笔记变更」不做常驻监听（B1 已定），只用测试库文件名 + mtime 快照近似，
 *   只读目录/元数据、绝不读正文、绝不写文件
 * - 不新增表：配置存 data/report-sources.json（原子替换）
 */
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";
import { getLibraries, TEST_VAULT } from "./libraries";
import { isUnder } from "./tidy";
import { listTodos } from "./todos";
import { listCheckins } from "./checkins";
import { listTidyLog } from "./tidy";
import { EXCLUDE_NAME_RE } from "./files";

export type SourceId =
  | "git_commits" | "tidy" | "todos_done" | "checkins" | "note_changes" | "manual_highlights";

export const SOURCE_CATALOG: { id: SourceId; label: string; desc: string }[] = [
  { id: "todos_done", label: "待办完成", desc: "本周标记为已完成的待办数量与清单（主库 items）" },
  { id: "checkins", label: "打卡", desc: "本周打卡记录条数与习惯分布（主库 items）" },
  { id: "tidy", label: "暂存区整理", desc: "本周整理次数 / 文件数（data/tidy-log.json）" },
  { id: "manual_highlights", label: "手动重点", desc: "你自己填的本周重点，原样进周报（不经过 AI）" },
  { id: "git_commits", label: "git 提交", desc: "整理落库产生的 commit 数（仅测试库整理日志，不做知识库版本管理）" },
  { id: "note_changes", label: "笔记变更", desc: "测试库内本周 mtime 变化的 .md 文件数（只读元数据快照近似，不读正文）" },
];

const ALL_IDS: SourceId[] = SOURCE_CATALOG.map((s) => s.id);
/** 默认开 4 类：稳定、有现成数据、不需外部扫描。git 提交与笔记变更默认关 */
const DEFAULT_ENABLED: Record<SourceId, boolean> = {
  todos_done: true, checkins: true, tidy: true, manual_highlights: true,
  git_commits: false, note_changes: false,
};

export interface ReportSourcesConfig {
  version: 1;
  enabled: Record<SourceId, boolean>;
  manual_highlights: string[];
  updated_at: string | null;
}

function configPath(): string { return path.join(getDataDir(), "report-sources.json"); }

function defaults(): ReportSourcesConfig {
  return { version: 1, enabled: { ...DEFAULT_ENABLED }, manual_highlights: [], updated_at: null };
}

export function getReportSources(): ReportSourcesConfig {
  try {
    const p = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Partial<ReportSourcesConfig>;
    if (p.version === 1) {
      const enabled = { ...DEFAULT_ENABLED };
      if (p.enabled && typeof p.enabled === "object") {
        for (const id of ALL_IDS) {
          if (typeof (p.enabled as Record<string, unknown>)[id] === "boolean") {
            enabled[id] = Boolean((p.enabled as Record<string, unknown>)[id]);
          }
        }
      }
      return {
        version: 1, enabled,
        manual_highlights: Array.isArray(p.manual_highlights)
          ? p.manual_highlights.filter((s) => typeof s === "string").map((s) => s.slice(0, 200)).slice(0, 20)
          : [],
        updated_at: typeof p.updated_at === "string" ? p.updated_at : null,
      };
    }
  } catch { /* 不存在或损坏 → 默认 */ }
  return defaults();
}

export function setReportSources(input: {
  enabled?: Partial<Record<SourceId, boolean>>;
  manual_highlights?: string[];
}): ReportSourcesConfig {
  const cur = getReportSources();
  const enabled = { ...cur.enabled };
  if (input.enabled && typeof input.enabled === "object") {
    for (const id of ALL_IDS) {
      if (typeof input.enabled[id] === "boolean") enabled[id] = Boolean(input.enabled[id]);
    }
  }
  const cfg: ReportSourcesConfig = {
    version: 1,
    enabled,
    manual_highlights: Array.isArray(input.manual_highlights)
      ? input.manual_highlights.filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim().slice(0, 200)).slice(0, 20)
      : cur.manual_highlights,
    updated_at: new Date().toISOString(),
  };
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, p);
  return cfg;
}

/* ---------------- 程序填数 ---------------- */

export interface WeekRange {
  start: string;       // YYYY-MM-DD（本周一）
  end: string;         // YYYY-MM-DD（今天）
  startIso: string;    // ISO，用于和 items.updated_at 比较
  key: string;         // 2026-W47
}

export function weekRange(now = new Date()): WeekRange {
  const p = (n: number) => String(n).padStart(2, "0");
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);
  // ISO 周编号
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return {
    start: `${monday.getFullYear()}-${p(monday.getMonth() + 1)}-${p(monday.getDate())}`,
    end: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    startIso: monday.toISOString(),
    key: `${d.getUTCFullYear()}-W${p(week)}`,
  };
}

export interface SourceBlock {
  id: SourceId;
  label: string;
  enabled: boolean;
  /** 速览数字（程序生成，AI 不得改写） */
  stats: { label: string; value: string | number }[];
  /** 完成明细（程序生成） */
  lines: string[];
  note: string;
}

const SKIP_DIRS = new Set([".git", ".obsidian", ".trash", "node_modules", ".next", "__pycache__", ".venv", "venv"]);

/** 只读扫测试库文件名 + mtime，统计本周变化（绝不读正文、绝不写） */
function noteChanges(range: WeekRange): { count: number; names: string[] } {
  const cfg = getLibraries();
  const roots = Array.from(new Set([...cfg.knowledgeDirs, cfg.exportVault]))
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => path.resolve(r))
    .filter((r) => isUnder(r, TEST_VAULT)); // 真实库零接触：只扫测试库
  const since = new Date(range.startIso).getTime();
  const names: string[] = [];
  const seen = new Set<string>();
  function walk(dir: string, depth: number): void {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name) || EXCLUDE_NAME_RE.test(e.name)) continue;
      if (e.isDirectory()) { walk(abs, depth + 1); continue; }
      if (!e.isFile() || path.extname(e.name).toLowerCase() !== ".md") continue;
      try {
        const st = fs.statSync(abs);
        if (st.mtimeMs >= since && !seen.has(abs.toLowerCase())) {
          seen.add(abs.toLowerCase());
          names.push(e.name);
        }
      } catch { /* ignore */ }
    }
  }
  for (const r of roots) walk(r, 0);
  return { count: names.length, names: names.slice(0, 20) };
}

/**
 * 按勾选源收集本周数据。全部程序填数，返回结构化块；
 * 关闭的源返回 enabled=false 且不带数据（周报里显示「已关闭」，不隐瞒）。
 */
export function collectSources(range: WeekRange, cfg = getReportSources()): SourceBlock[] {
  const out: SourceBlock[] = [];
  const off = (id: SourceId): SourceBlock => ({
    id, label: SOURCE_CATALOG.find((s) => s.id === id)!.label,
    enabled: false, stats: [], lines: [], note: "该数据源已关闭，本周不统计",
  });

  // 待办完成
  if (cfg.enabled.todos_done) {
    const done = listTodos("done").filter((t) => t.updated_at >= range.startIso);
    out.push({
      id: "todos_done", label: "待办完成", enabled: true,
      stats: [{ label: "完成待办", value: done.length }],
      lines: done.slice(0, 12).map((t) => t.title),
      note: done.length > 12 ? `仅列出前 12 项，共 ${done.length} 项` : "来自网站主库 items(type=todo)",
    });
  } else out.push(off("todos_done"));

  // 打卡
  if (cfg.enabled.checkins) {
    const list = listCheckins(1000).filter((c) => c.date >= range.start && c.date <= range.end);
    const habits = new Set(list.filter((c) => c.habit_id).map((c) => c.title));
    out.push({
      id: "checkins", label: "打卡", enabled: true,
      stats: [
        { label: "打卡记录", value: list.length },
        { label: "涉及习惯", value: habits.size },
      ],
      lines: list.slice(0, 12).map((c) => `${c.date} ${c.title}`),
      note: "来自网站主库 items(type=checkin)",
    });
  } else out.push(off("checkins"));

  // 暂存区整理
  const tidyRecords = listTidyLog().filter((r) => r.at >= range.startIso);
  if (cfg.enabled.tidy) {
    out.push({
      id: "tidy", label: "暂存区整理", enabled: true,
      stats: [
        { label: "整理次数", value: tidyRecords.length },
        { label: "整理文件", value: tidyRecords.reduce((n, r) => n + r.count, 0) },
      ],
      lines: tidyRecords.slice(0, 8).map((r) => `${r.at.slice(0, 10)} ${r.count} 个文件 · ${r.commit}`),
      note: "来自 data/tidy-log.json（测试库整理日志）",
    });
  } else out.push(off("tidy"));

  // 手动重点（原样进周报，不经过 AI）
  if (cfg.enabled.manual_highlights) {
    out.push({
      id: "manual_highlights", label: "手动重点", enabled: true,
      stats: [{ label: "条目", value: cfg.manual_highlights.length }],
      lines: cfg.manual_highlights.slice(0, 20),
      note: cfg.manual_highlights.length ? "你手动填写，原样呈现、不经过 AI" : "本周未填写手动重点（可在数据源面板补写）",
    });
  } else out.push(off("manual_highlights"));

  // git 提交
  if (cfg.enabled.git_commits) {
    const commits = Array.from(new Set(tidyRecords.map((r) => r.commit).filter(Boolean)));
    out.push({
      id: "git_commits", label: "git 提交", enabled: true,
      stats: [{ label: "整理 commit", value: commits.length }],
      lines: commits.slice(0, 12),
      note: "仅统计测试库整理产生的 commit；不对知识库做版本管理",
    });
  } else out.push(off("git_commits"));

  // 笔记变更（只读元数据快照）
  if (cfg.enabled.note_changes) {
    const c = noteChanges(range);
    out.push({
      id: "note_changes", label: "笔记变更", enabled: true,
      stats: [{ label: "变更 .md", value: c.count }],
      lines: c.names,
      note: "只读测试库文件名 + mtime 近似；不读正文、不常驻监听、不覆盖真实库",
    });
  } else out.push(off("note_changes"));

  return out;
}
