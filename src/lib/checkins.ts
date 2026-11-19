/**
 * 打卡数据操作（一期 A4）
 * - 不新增表：items 表两种 type
 *   - type='habit'   习惯定义：title=名称，payload={tags}
 *   - type='checkin' 打卡记录：title=内容/习惯名，payload={date, habit_id, note}
 * - 自由记录 habit_id=null：独立、不参与连续天数
 * - 同一习惯同一天重复打卡幂等（不产生第二条）
 * - 习惯软删除时其打卡记录保留（恢复后连续天数照旧）
 * - 无 op / 审批 / 快照（v2 概念已删）
 */
import crypto from "node:crypto";
import { getDb } from "./db";

export interface HabitPayload { tags: string[] }
export interface CheckinPayload { date: string; habit_id: string | null; note: string }

export interface Habit {
  id: string;
  title: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Checkin {
  id: string;
  title: string;
  date: string;
  habit_id: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface HabitView extends Habit {
  streak: number;
  todayDone: boolean;
  lastDate: string | null;
}

interface ItemRow {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  payload: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseHabit(raw: string | null): HabitPayload {
  try {
    const p = JSON.parse(raw || "{}") as Partial<HabitPayload>;
    return { tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [] };
  } catch { return { tags: [] }; }
}
function parseCheckin(raw: string | null): CheckinPayload {
  try {
    const p = JSON.parse(raw || "{}") as Partial<CheckinPayload>;
    return {
      date: typeof p.date === "string" ? p.date : "",
      habit_id: typeof p.habit_id === "string" ? p.habit_id : null,
      note: typeof p.note === "string" ? p.note : "",
    };
  } catch { return { date: "", habit_id: null, note: "" }; }
}
function rowToHabit(r: ItemRow): Habit {
  return {
    id: r.id, title: r.title ?? "", tags: parseHabit(r.payload).tags,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}
function rowToCheckin(r: ItemRow): Checkin {
  const p = parseCheckin(r.payload);
  return {
    id: r.id, title: r.title ?? "", date: p.date, habit_id: p.habit_id, note: p.note,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

/* ---------- 习惯 ---------- */

export function createHabit(title: string, tags: string[] = []): Habit {
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'habit', ?, '', ?, 1, ?, ?)`
  ).run(id, title, JSON.stringify({ tags } satisfies HabitPayload), now, now);
  return rowToHabit(db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow);
}

export function listHabits(onlyDeleted = false): Habit[] {
  const db = getDb();
  const sql = onlyDeleted
    ? "SELECT * FROM items WHERE type = 'habit' AND deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    : "SELECT * FROM items WHERE type = 'habit' AND deleted_at IS NULL ORDER BY created_at";
  return (db.prepare(sql).all() as ItemRow[]).map(rowToHabit);
}

export function getHabit(id: string): { habit: Habit; deleted: boolean } | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'habit'").get(id) as ItemRow | undefined;
  if (!r) return null;
  return { habit: rowToHabit(r), deleted: r.deleted_at !== null };
}

export function updateHabit(id: string, patch: { title?: string; tags?: string[] }): Habit | null {
  const db = getDb();
  const cur = getHabit(id);
  if (!cur || cur.deleted) return null;
  const next = {
    title: patch.title ?? cur.habit.title,
    tags: patch.tags ?? cur.habit.tags,
  };
  db.prepare(
    "UPDATE items SET title = ?, payload = ?, version = version + 1, updated_at = ? WHERE id = ?"
  ).run(next.title, JSON.stringify({ tags: next.tags } satisfies HabitPayload), nowIso(), id);
  return getHabit(id)!.habit;
}

/** 软删除习惯：其打卡记录保留不动 */
export function softDeleteHabit(id: string): boolean {
  const db = getDb();
  const cur = getHabit(id);
  if (!cur || cur.deleted) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  return true;
}

export function restoreHabit(id: string): boolean {
  const db = getDb();
  const r = db.prepare("SELECT deleted_at FROM items WHERE id = ? AND type = 'habit'").get(id) as
    | { deleted_at: string | null } | undefined;
  if (!r || r.deleted_at === null) return false;
  db.prepare("UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
  return true;
}

/* ---------- 打卡记录 ---------- */

/** 只返回未软删除的记录；按日期倒序、同日按创建时间倒序 */
export function listCheckins(limit = 50): Checkin[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM items WHERE type = 'checkin' AND deleted_at IS NULL")
    .all() as ItemRow[];
  return rows
    .map(rowToCheckin)
    .sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : (a.date < b.date ? 1 : -1)))
    .slice(0, limit);
}

export interface CreateCheckinResult {
  checkin: Checkin;
  created: boolean; // false = 幂等命中已有记录
}

/**
 * 新增打卡。
 * - habit_id 非空时，同一习惯 + 同一天幂等：已存在则直接返回，不新增
 * - 自由记录 habit_id=null：每次都新建
 */
export function createCheckin(input: {
  title: string;
  date: string;
  habit_id?: string | null;
  note?: string;
}): CreateCheckinResult {
  const db = getDb();
  const now = nowIso();
  const habitId = input.habit_id ?? null;

  if (habitId) {
    const existing = (db
      .prepare("SELECT * FROM items WHERE type = 'checkin' AND deleted_at IS NULL")
      .all() as ItemRow[])
      .map(rowToCheckin)
      .find((c) => c.habit_id === habitId && c.date === input.date);
    if (existing) return { checkin: existing, created: false };
  }

  const id = crypto.randomUUID();
  const payload: CheckinPayload = { date: input.date, habit_id: habitId, note: input.note ?? "" };
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'checkin', ?, '', ?, 1, ?, ?)`
  ).run(id, input.title, JSON.stringify(payload), now, now);
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow;
  return { checkin: rowToCheckin(row), created: true };
}

/** 删除打卡记录（软删除） */
export function softDeleteCheckin(id: string): boolean {
  const db = getDb();
  const r = db.prepare("SELECT deleted_at FROM items WHERE id = ? AND type = 'checkin'").get(id) as
    | { deleted_at: string | null } | undefined;
  if (!r || r.deleted_at !== null) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  return true;
}

/**
 * 连续天数：按实际有记录的日期算。
 * 口径：今天已打则从今天往回数；今天没打则从昨天往回数（今天还没过完不算断）。
 */
export function calcStreak(dates: string[], today = todayStr()): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** 习惯视图：附带连续天数、今日是否已打、最近打卡日期 */
export function listHabitViews(): HabitView[] {
  const habits = listHabits();
  const checkins = listCheckins(10000);
  const today = todayStr();
  return habits.map((h) => {
    const own = checkins.filter((c) => c.habit_id === h.id);
    const dates = own.map((c) => c.date);
    return {
      ...h,
      streak: calcStreak(dates, today),
      todayDone: dates.includes(today),
      lastDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    };
  });
}
