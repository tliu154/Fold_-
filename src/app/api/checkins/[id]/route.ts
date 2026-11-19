/**
 * /api/checkins/:id —— 编辑 / 删除打卡记录（一期 A4 + 首页改版）
 * PATCH  { title?, date?, note? } → { checkin }（仅自由记录可编辑）
 * DELETE → { ok }（软删除）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { softDeleteCheckin, updateCheckin } from "@/lib/checkins";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional(),
  note: z.string().max(1000).optional(),
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
  const checkin = updateCheckin(id, parsed.data);
  if (!checkin) {
    return Response.json({ error: "记录不存在或习惯打卡不可编辑" }, { status: 404 });
  }
  return Response.json({ checkin });
}

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
