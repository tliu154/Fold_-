/**
 * /api/todos/:id —— 待办编辑 / 完成切换 / 软删除（一期 A2）
 * PATCH  { title?, content?, due_at?, tags?, status? } → { todo }
 * DELETE → { ok }（软删除，写 deleted_at；可恢复）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { softDeleteTodo, updateTodo } from "@/lib/todos";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(4000).optional(),
  due_at: z.string().max(20).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  status: z.enum(["active", "done"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "todos-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }
  const todo = updateTodo(id, parsed.data);
  if (!todo) return Response.json({ error: "待办不存在或已删除" }, { status: 404 });
  return Response.json({ todo });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "todos-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  const ok = softDeleteTodo(id);
  if (!ok) return Response.json({ error: "待办不存在或已删除" }, { status: 404 });
  return Response.json({ ok: true });
}
