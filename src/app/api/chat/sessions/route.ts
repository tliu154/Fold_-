/**
 * /api/chat/sessions —— 会话列表与新建（一期 A6）
 * GET  → { sessions[] }（按最近活动倒序）
 * POST → { session }（新建空会话壳）
 */
import { requireAuth } from "@/lib/auth";
import { createSession, listSessions } from "@/lib/chat";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ sessions: listSessions() });
}

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ session: createSession() }, { status: 201 });
}
