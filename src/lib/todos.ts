/**
 * 待办数据操作（一期 A2）
 * - 存 items 表 type='todo'，不新增表（清单 3.3）
 * - title=标题 / content=备注 / payload={due_at, tags, status}
 * - 软删除：只写 deleted_at，恢复即置 NULL
 * - 无 op / 快照 / 审计（v2 概念已删；四期移动端需要时重新设计）
 */
import crypto from "node:crypto";
import { getDb } from "./db";

export interface TodoPayload {
  due_at: string | null; // ISO 日期（YYYY-MM-DD）或空
  tags: string[];
  status: "active" | "done";
}

export interface Todo {
  id: string;
  title: string;
  content: string; // 备注
  due_at: string | null;
  tags: string[];
  status: "active" | "done";
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

function parsePayload(raw: string | null): TodoPayload {
  try {
    const p = JSON.parse(raw || "{}") as Partial<TodoPayload>;
    return {
      due_at: typeof p.due_at === "string" ? p.due_at : null,
      tags: Array.isArray(p.tags) ? p.tags.filter((t) => typeof t === "string") : [],
      status: p.status === "done" ? "done" : "active",
    };
  } catch {
    return { due_at: null, tags: [], status: "active" };
  }
}

export function rowToTodo(row: ItemRow): Todo {
  const p = parsePayload(row.payload);
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content ?? "",
    due_at: p.due_at,
    tags: p.tags,
    status: p.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface TodoInput {
  title: string;
  content?: string;
  due_at?: string | null;
  tags?: string[];
}

/** 列表：默认排除软删除；filter=done/active 按 status 过滤 */
export function listTodos(filter: "all" | "active" | "done" = "all", includeDeleted = false): Todo[] {
  const db = getDb();
  const rows = (
    includeDeleted
      ? db.prepare("SELECT * FROM items WHERE type = 'todo' ORDER BY updated_at DESC").all()
      : db.prepare("SELECT * FROM items WHERE type = 'todo' AND deleted_at IS NULL ORDER BY updated_at DESC").all()
  ) as ItemRow[];
  const todos = rows.map(rowToTodo);
  if (filter === "active") return todos.filter((t) => t.status === "active");
  if (filter === "done") return todos.filter((t) => t.status === "done");
  return todos;
}

export function getTodo(id: string): { todo: Todo; deleted: boolean } | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = ? AND type = 'todo'").get(id) as
    | ItemRow
    | undefined;
  if (!row) return null;
  return { todo: rowToTodo(row), deleted: row.deleted_at !== null };
}

export function createTodo(input: TodoInput): Todo {
  const db = getDb();
  const now = nowIso();
  const id = crypto.randomUUID();
  const payload: TodoPayload = {
    due_at: input.due_at ?? null,
    tags: input.tags ?? [],
    status: "active",
  };
  db.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'todo', ?, ?, ?, 1, ?, ?)`
  ).run(id, input.title, input.content ?? "", JSON.stringify(payload), now, now);
  return getTodo(id)!.todo;
}

export interface TodoPatch {
  title?: string;
  content?: string;
  due_at?: string | null;
  tags?: string[];
  status?: "active" | "done";
}

/** 编辑 / 完成切换：只改传入字段，其余保留 */
export function updateTodo(id: string, patch: TodoPatch): Todo | null {
  const db = getDb();
  const cur = getTodo(id);
  if (!cur || cur.deleted) return null;
  const t = cur.todo;
  const next: Todo = {
    ...t,
    title: patch.title ?? t.title,
    content: patch.content ?? t.content,
    due_at: patch.due_at !== undefined ? patch.due_at : t.due_at,
    tags: patch.tags ?? t.tags,
    status: patch.status ?? t.status,
    updated_at: nowIso(),
  };
  const payload: TodoPayload = { due_at: next.due_at, tags: next.tags, status: next.status };
  db.prepare(
    "UPDATE items SET title = ?, content = ?, payload = ?, version = version + 1, updated_at = ? WHERE id = ?"
  ).run(next.title, next.content, JSON.stringify(payload), next.updated_at, id);
  return getTodo(id)!.todo;
}

/** 软删除：写 deleted_at；已删除返回 false */
export function softDeleteTodo(id: string): boolean {
  const db = getDb();
  const cur = getTodo(id);
  if (!cur || cur.deleted) return false;
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), id);
  return true;
}

/** 恢复：deleted_at 置 NULL；未删除返回 false */
export function restoreTodo(id: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT deleted_at FROM items WHERE id = ? AND type = 'todo'").get(id) as
    | { deleted_at: string | null }
    | undefined;
  if (!row || row.deleted_at === null) return false;
  db.prepare("UPDATE items SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
  return true;
}
