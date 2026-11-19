/**
 * /api/todos —— 待办列表与新增（一期 A2）
 * GET  ?filter=all|active|done[&includeDeleted=1] → { todos[] }
 * POST { title, content?, due_at?, tags? } → { todo }
 * - 存 items 表 type='todo'；浏览器直连主库，无 op / 审批（v2 概念已删）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createTodo, listTodos, rowToTodo, type ItemRow } from "@/lib/todos";
import { getDb } from "@/lib/db";

const createSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(200),
  content: z.string().max(4000).optional().default(""),
  due_at: z.string().max(20).nullable().optional().default(null),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional().default([]),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const filterRaw = url.searchParams.get("filter") ?? "all";
  const filter = filterRaw === "active" || filterRaw === "done" ? filterRaw : "all";
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";
  const onlyDeleted = url.searchParams.get("onlyDeleted") === "1";
  if (onlyDeleted) {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM items WHERE type = 'todo' AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
      .all() as ItemRow[];
    return Response.json({ todos: rows.map(rowToTodo) });
  }
  return Response.json({ todos: listTodos(filter, includeDeleted) });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "todos-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }
  return Response.json({ todo: createTodo(parsed.data) }, { status: 201 });
}
