/**
 * /api/memory/:id —— 记忆条目编辑 / 删除（一期 A7）
 * PATCH  { title?, content?, tags?, scope?, feature? } → { item }
 * DELETE → { ok }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { deleteMemoryItem, updateMemoryItem } from "@/lib/memory";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(8000).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  scope: z.enum(["profile", "feature", "fact"]).optional(),
  feature: z.string().max(64).optional(),
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
  const item = updateMemoryItem(id, parsed.data);
  if (!item) return Response.json({ error: "记忆条目不存在" }, { status: 404 });
  return Response.json({ item });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!deleteMemoryItem(id)) return Response.json({ error: "记忆条目不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
