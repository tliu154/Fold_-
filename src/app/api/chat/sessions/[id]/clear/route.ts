/**
 * POST /api/chat/sessions/:id/clear —— 清空会话消息（一期 A6）
 * 只删 ai_messages，保留会话壳（标题若为自动派生则回到「新对话」）
 */
import { requireAuth } from "@/lib/auth";
import { clearSession } from "@/lib/chat";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!clearSession(id)) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
