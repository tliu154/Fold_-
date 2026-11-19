/**
 * 日程数据操作（一期 A3）
 * - 存 items 表 type='event'，不新增表（清单 3.3）
 * - title=标题 / content=备注 / payload={date, start, end, location, tags}
 * - 软删除：只写 deleted_at；恢复置 NULL
 * - 无完成态（日程不是待办）；无 op / 审批（v2 概念已删）
 */
import crypto from "node:crypto";
import { getDb } from "./db";

export interface EventPayload {
  date: string; // YYYY-MM-DD
  start: string; // HH:mm，空表示未定
  end: string; // HH:mm，空表示未定
  location: string;
  tags: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  content: string; // 备注
  date: string;
  start: string;
  end: string;
  location: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
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

function parsePayload(raw: string | null): EventPayload {
  try {
    const p = JSON.parse(raw || "{}") as Partial<EventPayload>;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      date: s(p.date),
      start: s(p.start),
      end: s(p.end),
      location: s(p.location),
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
    };
  } catch {
    return { date: "", start: "", end: "", location: "", tags: [] };
  }
}

export function rowToEvent(row: ItemRow): CalendarEvent {
  const p = parsePayload(row.payload);
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content ?? "",
    date: p.date,
    start: p.start,
    end: p.end,
    location: p.location,
    tags: p.tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface EventInput {
  title: string;
  content?: string;
  date: string;
  start?: string;
  end?: string;
  location?: string;
  tags?: string[];
}

export function listEvents(onlyDeleted = false): CalendarEvent[] {
  const db = getDb();
  const sql = onlyDeleted
    ? "SELECT * FROM items WHERE type = 'event' AND deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    : "SELECT * FROM items WHERE type = 'event' AND deleted_at IS NULL ORDER BY updated_at DESC";
  return (db.prepare(sql).all() as ItemRow[]).map(rowToEvent);
}

export function getEvent(id: string): { event: CalendarEvent; deleted: boolean } | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'event'").get(id) as
    | ItemRow
    | undefined;
  if (!row) return null;
  return { event: rowToEvent(row), deleted: row.deleted_at !== null };
}

export function createEvent(input: EventInput): CalendarEvent {
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const payload: EventPayload = {
    date: input.date,
    start: input.start ?? "",
    end: input.end ?? "",
    location: input.location ?? "",
    tags: input.tags ?? [],
  };
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'event', ?, ?, ?, 1, ?, ?)`
  ).run(id, input.title, input.content ?? "", JSON.stringify(payload), now, now);
  return getEvent(id)!.event;
}

export interface EventPatch {
  title?: string;
  content?: string;
  date?: string;
  start?: string;
  end?: string;
  location?: string;
  tags?: string[];
}

export function updateEvent(id: string, patch: EventPatch): CalendarEvent | null {
  const db = getDb();
  const cur = getEvent(id);
  if (!cur || cur.deleted) return null;
  const e = cur.event;
  const next: CalendarEvent = {
    ...e,
    title: patch.title ?? e.title,
    content: patch.content ?? e.content,
    date: patch.date ?? e.date,
    start: patch.start ?? e.start,
    end: patch.end ?? e.end,
    location: patch.location ?? e.location,
    tags: patch.tags ?? e.tags,
    updated_at: nowIso(),
  };
  const payload: EventPayload = {
    date: next.date, start: next.start, end: next.end, location: next.location, tags: next.tags,
  };
  db.prepare(
    "UPDATE items SET title = ?, content = ?, payload = ?, version = version + 1, updated_at = ? WHERE id = ?"
  ).run(next.title, next.content, JSON.stringify(payload), next.updated_at, id);
  return getEvent(id)!.event;
}

export function softDeleteEvent(id: string): boolean {
  const db = getDb();
  const cur = getEvent(id);
  if (!cur || cur.deleted) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  return true;
}

export function restoreEvent(id: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT deleted_at FROM items WHERE id = ? AND type = 'event'").get(id) as
    | { deleted_at: string | null }
    | undefined;
  if (!row || row.deleted_at === null) return false;
  db.prepare("UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
  return true;
}
