/**
 * /api/habits/:id —— 习惯编辑 / 软删除（一期 A4）
 * PATCH  { title?, tags? } → { habit }
 * DELETE → { ok }（软删除；其打卡记录保留）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { softDeleteHabit, updateHabit } from "@/lib/checkins";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
});
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "checkins-write"), 90, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const habit = updateHabit(id, parsed.data);
  if (!habit) return Response.json({ error: "习惯不存在或已删除" }, { status: 404 });
  return Response.json({ habit });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "checkins-write"), 90, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!softDeleteHabit(id)) return Response.json({ error: "习惯不存在或已删除" }, { status: 404 });
  return Response.json({ ok: true });
}
