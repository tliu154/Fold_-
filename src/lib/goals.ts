/**
 * 长期目标（一期 A5）
 * - 存本地配置文件 data/goals.json（由 DATA_DIR 决定），**不进 SQLite 主库**（清单 P13）
 * - 结构 { version: 1, goals: Goal[] }；文件不存在自动创建空清单
 * - 独立于待办/日程/打卡，不联动、不算自动进度
 * - 删除 = 直接移除（配置轻量，不做软删除/回收站）
 * - 无文件 watcher：外部手改 JSON 需刷新页面才生效
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDataDir } from "./config";

export type GoalStatus = "active" | "done" | "paused";

export interface Goal {
  id: string;
  title: string;
  description: string;
  target_date: string | null; // YYYY-MM-DD 或 null
  status: GoalStatus;
  progress: number; // 0-100，手填
  created_at: string;
  updated_at: string;
}

interface GoalsFile {
  version: 1;
  goals: Goal[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function filePath(): string {
  return path.join(getDataDir(), "goals.json");
}

function emptyFile(): GoalsFile {
  return { version: 1, goals: [] };
}

function readFile(): GoalsFile {
  const p = filePath();
  try {
    if (!fs.existsSync(p)) return emptyFile();
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<GoalsFile>;
    if (!parsed || !Array.isArray(parsed.goals)) return emptyFile();
    return { version: 1, goals: parsed.goals as Goal[] };
  } catch {
    // 配置损坏时不静默覆盖：返回空清单但保留原文件（避免数据丢失）
    return emptyFile();
  }
}

function writeFile(data: GoalsFile): void {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p); // 原子替换，避免写一半损坏
}

/** 单进程内串行化写操作，避免并发请求互相覆盖 */
let writeQueue: Promise<unknown> = Promise.resolve();
function withWriteLock<T>(fn: () => T): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

export function listGoals(): Goal[] {
  return readFile().goals.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export interface GoalInput {
  title: string;
  description?: string;
  target_date?: string | null;
  status?: GoalStatus;
  progress?: number;
}

export function createGoal(input: GoalInput): Promise<Goal> {
  return withWriteLock(() => {
    const data = readFile();
    const now = nowIso();
    const goal: Goal = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description ?? "",
      target_date: input.target_date ?? null,
      status: input.status ?? "active",
      progress: input.progress ?? 0,
      created_at: now,
      updated_at: now,
    };
    data.goals.push(goal);
    writeFile(data);
    return goal;
  });
}

export interface GoalPatch {
  title?: string;
  description?: string;
  target_date?: string | null;
  status?: GoalStatus;
  progress?: number;
}

export function updateGoal(id: string, patch: GoalPatch): Promise<Goal | null> {
  return withWriteLock(() => {
    const data = readFile();
    const idx = data.goals.findIndex((g) => g.id === id);
    if (idx < 0) return null;
    const cur = data.goals[idx];
    const next: Goal = {
      ...cur,
      title: patch.title ?? cur.title,
      description: patch.description ?? cur.description,
      target_date: patch.target_date !== undefined ? patch.target_date : cur.target_date,
      status: patch.status ?? cur.status,
      progress: patch.progress ?? cur.progress,
      updated_at: nowIso(),
    };
    data.goals[idx] = next;
    writeFile(data);
    return next;
  });
}

export function deleteGoal(id: string): Promise<boolean> {
  return withWriteLock(() => {
    const data = readFile();
    const next = data.goals.filter((g) => g.id !== id);
    if (next.length === data.goals.length) return false;
    data.goals = next;
    writeFile(data);
    return true;
  });
}
