/**
 * GET /api/chat/sessions/:id/messages —— 会话消息列表（一期 A6）
 * 返回按时间正序的全部消息（前端展示用；上下文截断由服务端 buildContext 负责）
 */
import { requireAuth } from "@/lib/auth";
import { getSession, listMessages } from "@/lib/chat";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getSession(id)) return Response.json({ error: "会话不存在" }, { status: 404 });
  return Response.json({ messages: listMessages(id) });
}
