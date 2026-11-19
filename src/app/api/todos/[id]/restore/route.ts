/**
 * POST /api/todos/:id/restore —— 恢复软删除的待办（一期 A2）
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { restoreTodo } from "@/lib/todos";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "todos-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  const ok = restoreTodo(id);
  if (!ok) return Response.json({ error: "待办不存在或未删除" }, { status: 404 });
  return Response.json({ ok: true });
}
