/**
 * POST /api/events/:id/restore —— 恢复软删除的日程（一期 A3）
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { restoreEvent } from "@/lib/events";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "events-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!restoreEvent(id)) return Response.json({ error: "日程不存在或未删除" }, { status: 404 });
  return Response.json({ ok: true });
}
