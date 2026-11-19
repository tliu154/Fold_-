/**
 * /api/events/:id —— 日程编辑 / 软删除（一期 A3）
 * PATCH  { title?, date?, start?, end?, location?, content?, tags? } → { event }
 * DELETE → { ok }（软删除，可恢复；日程无完成态）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { softDeleteEvent, updateEvent } from "@/lib/events";

const timeSchema = z
  .string()
  .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "时间格式应为 HH:mm 或留空");

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: timeSchema.optional(),
  end: timeSchema.optional(),
  location: z.string().max(200).optional(),
  content: z.string().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "events-write"), 60, 60_000)) {
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
  const event = updateEvent(id, parsed.data);
  if (!event) return Response.json({ error: "日程不存在或已删除" }, { status: 404 });
  return Response.json({ event });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "events-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!softDeleteEvent(id)) return Response.json({ error: "日程不存在或已删除" }, { status: 404 });
  return Response.json({ ok: true });
}
