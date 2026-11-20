/**
 * 定时任务调度（三期 C1 · 调度底座 + 站内消息）
 *
 * 边界（C1 已确认规格）：
 * - 只做调度 + 站内消息；不做周报模板、Qwen 资讯、审批闸门、GLM 接入、邮件/系统通知
 * - **不动系统**：逻辑跑在 Next.js 进程内，复用 instrumentation 启动钩子；不写注册表、
 *   不建计划任务、不装服务。服务没开就不跑，开机后由站内消息提示「错过了 N 次」
 * - 不新增表：任务配置 data/scheduler.json、运行态 data/scheduler-state.json、
 *   消息复用 items 表 type=message（见 messages.ts）
 * - P4「错过不补跑」：到点执行一次；服务停机期间应跑未跑的只累加 missed_count，绝不补执行
 * - 「模板骨架 + 程序填数 + AI 评述」本轮只做前两步，**AI 评述留占位不做**（周报轮次再接）
 *
 * 触发模型：node-cron 每 60 秒跑一次 runTick()。tick 内对每个启用任务
 * 计算 (last_settled_at, now] 区间内的应跑时刻：
 *   - 最新一个时刻距今 ≤5 分钟 → 视为刚到点，执行一次
 *   - 其余（含停机期间的）→ 全部计为错过，不补跑
 * 手动「立即运行」走同一个 executeJob，只是绕过 tick 判定。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getDataDir } from "./config";
import { callStructured } from "./chat";
import { listTodos } from "./todos";
import { listEvents } from "./events";
import { listCheckins, listHabitViews } from "./checkins";
import { countInboxMd, listTidyLog } from "./tidy";
import {
  createMessage, findBySource, updateMessageBody,
  type MessageKind, type Message,
} from "./messages";

/* ---------------- 类型 ---------------- */

export type JobId = "daily_focus" | "inbox_scan" | "weekly_digest";

export interface Schedule {
  kind: "daily" | "weekly";
  time: string;        // HH:mm（本地时间）
  weekday?: number;    // 0=周日 … 6=周六，仅 weekly 用
}

export interface SchedulerTask {
  id: string;
  name: string;
  job: JobId;
  enabled: boolean;
  schedule: Schedule;
  created_at: string;
  updated_at: string;
}

export interface SchedulerConfig {
  version: 1;
  tasks: SchedulerTask[];
}

export interface TaskState {
  last_run_at: string | null;    // 真实执行时间
  last_settled_at: string;       // 最后一次盘点到的时间点（推进它避免重复计错过）
  missed_count: number;          // 累计错过次数
}

export interface SchedulerState {
  version: 1;
  tasks: Record<string, TaskState>;
  last_tick_at: string | null;
  last_missed_notice_at: string | null;
}

export const JOB_CATALOG: { id: JobId; name: string; desc: string }[] = [
  { id: "daily_focus", name: "每日重点", desc: "汇总今天待办 / 日程 / 打卡为一条站内消息" },
  { id: "inbox_scan", name: "未整理目录巡检", desc: "发现新 .md 就提醒去点「整理新笔记」，只读、绝不自动整理" },
  { id: "weekly_digest", name: "每周数据小结", desc: "本周待办完成 / 打卡 / 日程 / 整理次数，纯程序填数不调模型" },
];

/** AI 评述占位：C1 不落地，周报轮次接入（清单「模板骨架 + 程序填数 + AI 评述」第三步） */
export const AI_COMMENTARY_ENABLED = false;

/* ---------------- 配置文件 ---------------- */

function configPath(): string { return path.join(getDataDir(), "scheduler.json"); }
function statePath(): string { return path.join(getDataDir(), "scheduler-state.json"); }
function nowIso(d = new Date()): string { return d.toISOString(); }
function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function atomicWrite(p: string, data: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

function defaultTasks(now = new Date()): SchedulerTask[] {
  const at = nowIso(now);
  return [
    { id: "job-daily-focus", name: "每日重点", job: "daily_focus", enabled: true,
      schedule: { kind: "daily", time: "08:00" }, created_at: at, updated_at: at },
    { id: "job-inbox-scan", name: "未整理目录巡检", job: "inbox_scan", enabled: true,
      schedule: { kind: "daily", time: "20:00" }, created_at: at, updated_at: at },
    { id: "job-weekly-digest", name: "每周数据小结", job: "weekly_digest", enabled: true,
      schedule: { kind: "weekly", time: "21:00", weekday: 0 }, created_at: at, updated_at: at },
  ];
}

export function readConfig(): SchedulerConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Partial<SchedulerConfig>;
    if (parsed.version === 1 && Array.isArray(parsed.tasks)) {
      return { version: 1, tasks: parsed.tasks as SchedulerTask[] };
    }
  } catch { /* 不存在或损坏 → 首次生成默认三任务 */ }
  const cfg: SchedulerConfig = { version: 1, tasks: defaultTasks() };
  atomicWrite(configPath(), cfg);
  return cfg;
}

export function writeConfig(tasks: SchedulerTask[]): SchedulerConfig {
  const cfg: SchedulerConfig = { version: 1, tasks };
  atomicWrite(configPath(), cfg);
  return cfg;
}

export function readState(): SchedulerState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf-8")) as Partial<SchedulerState>;
    if (parsed.version === 1 && parsed.tasks && typeof parsed.tasks === "object") {
      return {
        version: 1,
        tasks: parsed.tasks as Record<string, TaskState>,
        last_tick_at: typeof parsed.last_tick_at === "string" ? parsed.last_tick_at : null,
        last_missed_notice_at: typeof parsed.last_missed_notice_at === "string" ? parsed.last_missed_notice_at : null,
      };
    }
  } catch { /* 首次 */ }
  return { version: 1, tasks: {}, last_tick_at: null, last_missed_notice_at: null };
}

export function writeState(state: SchedulerState): void {
  atomicWrite(statePath(), state);
}

/** 状态页所需的完整快照 */
export function getSchedulerStatus() {
  return {
    config: readConfig(),
    state: readState(),
    jobs: JOB_CATALOG,
    runtime: {
      tick_interval: "每 60 秒",
      ai_commentary_enabled: AI_COMMENTARY_ENABLED,
      note: "服务进程内调度，不动系统设置；服务未运行时任务不跑、不补跑，只累计错过次数",
    },
  };
}

/* ---------------- 应跑时刻计算 ---------------- */

const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function describeSchedule(s: Schedule): string {
  const base = s.kind === "daily" ? "每天" : `每${WEEKDAY_LABEL[s.weekday ?? 0]}`;
  return `${base} ${s.time}`;
}

function localMoment(day: Date, time: string): Date {
  const [h, m] = time.split(":").map((v) => Number(v) || 0);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/**
 * 列出 (from, to] 区间内所有应跑时刻（本地时间），最多回溯 400 天防死循环。
 * 纯函数，便于验收与推理。
 */
export function dueTimesBetween(task: SchedulerTask, fromIso: string, toIso: string): string[] {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return [];
  const out: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0);
  for (let i = 0; i <= 400; i++) {
    if (cursor > to) break;
    const match = task.schedule.kind === "daily"
      || (task.schedule.kind === "weekly" && cursor.getDay() === (task.schedule.weekday ?? 0));
    if (match) {
      const t = localMoment(cursor, task.schedule.time);
      if (t > from && t <= to) out.push(t.toISOString());
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/* ---------------- 三个内置任务（模板骨架 + 程序填数） ---------------- */

function section(title: string, lines: string[]): string {
  return `${title}：\n${lines.length ? lines.map((l) => `  · ${l}`).join("\n") : "  · 无"}`;
}

function buildJobBody(job: JobId, now: Date): { title: string; body: string; kind: MessageKind } {
  const today = todayStr(now);
  if (job === "daily_focus") {
    const todos = listTodos("active");
    const urgent = todos.filter((t) => !t.due_at || t.due_at <= today).slice(0, 5);
    const events = listEvents().filter((e) => e.date === today);
    const habits = listHabitViews();
    const done = habits.filter((h) => h.todayDone).length;
    const body = [
      `【今日重点 · ${today}】`,
      section(`待办：未完成 ${todos.length} 项（今日到期 / 已逾期 ${urgent.length} 项）`,
        urgent.map((t) => `${t.title}${t.due_at ? `（截止 ${t.due_at}）` : ""}`)),
      section(`今日日程：${events.length} 项`,
        events.slice(0, 5).map((e) => `${e.start || "未定时间"} ${e.title}${e.location ? ` @${e.location}` : ""}`)),
      section(`打卡：${habits.length ? `${done}/${habits.length} 已完成` : "暂无习惯"}`,
        habits.slice(0, 5).map((h) => `${h.todayDone ? "☑" : "☐"} ${h.title}（连续 ${h.streak} 天）`)),
      "",
      "（本条由定时任务自动生成，仅程序填数；AI 评述将在周报轮次接入）",
    ].join("\n");
    return { title: `今日重点 · ${today}`, body, kind: "daily_focus" };
  }

  if (job === "inbox_scan") {
    let info: { dir: string; exists: boolean; md: string[] };
    try { info = countInboxMd(); }
    catch (e) {
      return {
        title: `未整理目录巡检 · ${today}`,
        body: `巡检未完成：${(e as Error).message}\n网站不会自动整理，请检查「资源库配置」里的未整理目录。`,
        kind: "inbox_scan",
      };
    }
    const body = [
      `【未整理目录巡检 · ${today}】`,
      `目录：${info.dir}`,
      info.exists ? `发现 ${info.md.length} 个待整理 .md 文件` : "目录不存在或为空",
      ...(info.md.length ? info.md.slice(0, 5).map((n) => `  · ${n}`) : []),
      ...(info.md.length > 5 ? [`  · …还有 ${info.md.length - 5} 个`] : []),
      "",
      "请到「知识库」页点「整理新笔记」查看变更预览后自行确认；网站只提醒，**绝不自动整理**。",
      "",
      "（本条由定时任务自动生成，纯程序统计；AI 评述将在周报轮次接入）",
    ].join("\n");
    return { title: `未整理目录巡检 · ${today}${info.md.length ? `（${info.md.length} 个新文件）` : ""}`, body, kind: "inbox_scan" };
  }

  // weekly_digest：本周一 00:00 起（本地时间）
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);
  const weekStartIso = monday.toISOString();
  const weekStartStr = todayStr(monday);
  const doneTodos = listTodos("done").filter((t) => t.updated_at >= weekStartIso).length;
  const checkins = listCheckins(1000).filter((c) => c.date >= weekStartStr).length;
  const events = listEvents().filter((e) => e.date >= weekStartStr && e.date <= today).length;
  const tidyRecords = listTidyLog().filter((r) => r.at >= weekStartIso);
  const tidyFiles = tidyRecords.reduce((n, r) => n + r.count, 0);
  const body = [
    `【每周数据小结 · ${weekStartStr} ~ ${today}】`,
    `本周完成待办：${doneTodos} 项`,
    `本周打卡记录：${checkins} 条`,
    `本周日程：${events} 项`,
    `暂存区整理：${tidyRecords.length} 次 / ${tidyFiles} 个文件`,
    "",
    "（纯程序填数，不调用模型；AI 评述与周报模板将在周报轮次接入）",
  ].join("\n");
  return { title: `每周数据小结 · ${weekStartStr}`, body, kind: "weekly_digest" };
}

/** 执行一个任务：生成一条站内消息。手动与定时走同一条路径 */
export function executeJob(task: SchedulerTask, trigger: "manual" | "cron", now = new Date()): Message {
  const { title, body, kind } = buildJobBody(task.job, now);
  const source = trigger === "cron"
    ? `cron:${task.id}:${todayStr(now)}`
    : `manual:${task.id}:${now.getTime()}`;
  return createMessage({ kind, title, body, source }, trigger === "cron");
}

/* ---------------- 错过汇总消息 ---------------- */

function upsertMissedNotice(amount: number, state: SchedulerState, now: Date): void {
  const source = `missed:${todayStr(now)}`;
  const cfg = readConfig();
  const lines = cfg.tasks.filter((t) => t.enabled).map((t) => {
    const s = state.tasks[t.id];
    return `  · ${t.name}（${describeSchedule(t.schedule)}）累计错过 ${s?.missed_count ?? 0} 次`;
  });
  const body = [
    `【定时任务错过汇总】本次盘点新增 ${amount} 次未执行。`,
    "按清单 P4「错过不补跑」：服务没开期间的任务只记次数，不会补执行、不改动任何业务数据。",
    ...lines,
  ].join("\n");
  const old = findBySource(source);
  if (old) updateMessageBody(old.id, body);
  else createMessage({ kind: "missed", title: `错过了 ${amount} 次定时任务`, body, source }, true);
  state.last_missed_notice_at = nowIso(now);
}

/* ---------------- tick / 手动运行 ---------------- */

export interface TickResult {
  at: string;
  ran: string[];
  missed: number;
  missed_by_task: Record<string, number>;
}

/**
 * 一次调度盘点。由 cron.ts 每分钟调用、服务启动时立即调用一次，
 * 也可由 /api/scheduler/tick 手动触发（验收用，逻辑完全相同）。
 */
export function runTick(now = new Date()): TickResult {
  const cfg = readConfig();
  const state = readState();
  const at = nowIso(now);
  const ran: string[] = [];
  const missedBy: Record<string, number> = {};
  let missedTotal = 0;

  for (const task of cfg.tasks) {
    if (!task.enabled) continue;
    const cur: TaskState = state.tasks[task.id] ?? {
      last_run_at: null, last_settled_at: task.created_at, missed_count: 0,
    };
    const dues = dueTimesBetween(task, cur.last_settled_at, at);
    if (dues.length === 0) {
      // 也推进结算点，避免每次 tick 都从很早的时间重新枚举
      cur.last_settled_at = at;
      state.tasks[task.id] = cur;
      continue;
    }

    // 最新一个应跑时刻在 5 分钟内 → 正常触发一次；更早的全部算错过，不补跑
    const latest = dues[dues.length - 1];
    const fresh = now.getTime() - new Date(latest).getTime() <= 5 * 60_000;
    const runIdx = fresh ? dues.length - 1 : dues.length;
    const missedDues = dues.slice(0, runIdx).filter(
      (d) => !cur.last_run_at || d > cur.last_run_at
    );
    if (missedDues.length) {
      cur.missed_count += missedDues.length;
      missedTotal += missedDues.length;
      missedBy[task.id] = missedDues.length;
    }
    if (fresh) {
      try { executeJob(task, "cron", now); ran.push(task.id); cur.last_run_at = at; }
      catch (e) { console.error(`[scheduler] 任务 ${task.id} 执行失败：`, e); }
    }
    cur.last_settled_at = at;
    state.tasks[task.id] = cur;
  }

  state.last_tick_at = at;
  if (missedTotal > 0) upsertMissedNotice(missedTotal, state, now);
  writeState(state);
  return { at, ran, missed: missedTotal, missed_by_task: missedBy };
}

export function runTaskNow(taskId: string, now = new Date()): Message {
  const task = readConfig().tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("任务不存在");
  const msg = executeJob(task, "manual", now);
  const state = readState();
  const at = nowIso(now);
  const cur: TaskState = state.tasks[task.id] ?? {
    last_run_at: null, last_settled_at: task.created_at, missed_count: 0,
  };
  state.tasks[task.id] = { ...cur, last_run_at: at, last_settled_at: at };
  writeState(state);
  return msg;
}

/* ---------------- 自然语言解析（预览，不落库） ---------------- */

export interface ParsedSchedule {
  schedule: Schedule;
  label: string;
  confidence: string;
}

interface RawParsed {
  kind?: unknown;
  time?: unknown;
  weekday?: unknown;
  confidence?: unknown;
}

/**
 * 调一次已有的 callStructured 把自然语言解析成同一份调度配置。
 * 只返回预览，**不写任何文件**；保存必须用户再点一次确认（走 PUT /api/scheduler）。
 * 模型不可用时抛错，由 API 明确回报「真实解析链路未验证」，不用 mock 假装成功。
 */
export async function parseSchedule(text: string): Promise<ParsedSchedule> {
  const raw = await callStructured<RawParsed>([
    {
      role: "system",
      content: "把用户的定时描述解析成 JSON。只输出 JSON 对象，字段：kind（daily 或 weekly）、"
        + "time（24 小时制 HH:mm）、weekday（仅 weekly 需要，0=周日,1=周一,...,6=周六）、"
        + "confidence（high/medium/low）。无法判断时间时 time 用 09:00。不要输出其它文字。",
    },
    { role: "user", content: text },
  ]);
  const kind = raw?.kind === "weekly" ? "weekly" : raw?.kind === "daily" ? "daily" : null;
  if (!kind) throw new Error("模型未能解析出「每天 / 每周」类型，请改用结构化选时");
  const t = typeof raw.time === "string" ? raw.time.trim() : "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new Error("模型未返回合法的 HH:mm 时间，请改用结构化选时");
  }
  const time = `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
  const wd = Number(raw.weekday);
  const weekday = kind === "weekly"
    ? (Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 1)
    : undefined;
  const schedule: Schedule = { kind, time, ...(weekday !== undefined ? { weekday } : {}) };
  return {
    schedule,
    label: describeSchedule(schedule),
    confidence: typeof raw.confidence === "string" ? raw.confidence.slice(0, 20) : "medium",
  };
}

/* ---------------- 任务增删改 ---------------- */

export interface TaskInput {
  id?: string;
  name: string;
  job: JobId;
  enabled: boolean;
  schedule: Schedule;
}

/** 整份替换任务列表（前端编辑后一次提交），保留原 created_at / id */
export function replaceTasks(inputs: TaskInput[]): SchedulerConfig {
  const old = new Map(readConfig().tasks.map((t) => [t.id, t]));
  const now = nowIso();
  const tasks = inputs.map((i) => {
    const prev = i.id ? old.get(i.id) : undefined;
    return {
      id: i.id || crypto.randomUUID(),
      name: i.name.trim().slice(0, 60) || JOB_CATALOG.find((j) => j.id === i.job)?.name || "定时任务",
      job: i.job,
      enabled: i.enabled,
      schedule: i.schedule,
      created_at: prev?.created_at ?? now,
      updated_at: now,
    } satisfies SchedulerTask;
  });
  return writeConfig(tasks);
}

