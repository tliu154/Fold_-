/**
 * /api/capture/items/:id —— 手动整理 / 删除（一期 A10）
 * PATCH { title?, tags? } → { item }（状态转 done）
 * DELETE → { ok }（软删除墓碑）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { deleteCapture, organizeCapture } from "@/lib/capture";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const item = organizeCapture(id, parsed.data);
  if (!item) return Response.json({ error: "记录不存在" }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!deleteCapture(id)) return Response.json({ error: "记录不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
