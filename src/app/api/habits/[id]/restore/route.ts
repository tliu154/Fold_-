/**
 * POST /api/habits/:id/restore —— 恢复软删除的习惯（一期 A4）
 * 打卡记录一直保留，恢复后连续天数照旧
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { restoreHabit } from "@/lib/checkins";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "checkins-write"), 90, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!restoreHabit(id)) return Response.json({ error: "习惯不存在或未删除" }, { status: 404 });
  return Response.json({ ok: true });
}
