/**
 * DELETE /api/checkins/:id —— 删除打卡记录（一期 A4，软删除）
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { softDeleteCheckin } from "@/lib/checkins";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "checkins-write"), 90, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!softDeleteCheckin(id)) return Response.json({ error: "记录不存在或已删除" }, { status: 404 });
  return Response.json({ ok: true });
}
