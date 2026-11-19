/**
 * /api/chat/sessions/:id —— 重命名 / 删除会话（一期 A6）
 * PATCH  { title } → { session }
 * DELETE → { ok }（连消息一起删）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { deleteSession, renameSession } from "@/lib/chat";

const patchSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(100),
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
  const session = renameSession(id, parsed.data.title);
  if (!session) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ session });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!deleteSession(id)) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
