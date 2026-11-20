/**
 * /api/messages —— 站内消息（三期 C1）
 * GET    ?filter=all|unread → { messages, unread }
 * PATCH  { id, read } 或 { all: true } → 标记已读（幂等）
 * DELETE ?id=xxx（或 body {id}）→ 软删除（复用 items.deleted_at）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  listMessages, unreadCount, markRead, markAllRead, softDeleteMessage,
} from "@/lib/messages";

const patchSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ id: z.string().min(1).max(100), read: z.boolean().optional().default(true) }),
]);

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const filter = new URL(req.url).searchParams.get("filter") === "unread" ? "unread" : "all";
  return Response.json({ messages: listMessages(filter), unread: unreadCount() });
}

export async function PATCH(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "messages-write"), 120, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "参数不合法" }, { status: 400 });
  if ("all" in parsed.data) {
    return Response.json({ updated: markAllRead(), unread: unreadCount() });
  }
  const msg = markRead(parsed.data.id, parsed.data.read);
  if (!msg) return Response.json({ error: "消息不存在" }, { status: 404 });
  return Response.json({ message: msg, unread: unreadCount() });
}

export async function DELETE(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "messages-write"), 120, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const url = new URL(req.url);
  let id = url.searchParams.get("id") ?? "";
  if (!id) {
    try {
      const body = await req.json() as { id?: unknown };
      if (typeof body.id === "string") id = body.id;
    } catch { /* 无 body，用 query */ }
  }
  if (!id) return Response.json({ error: "缺少消息 id" }, { status: 400 });
  if (!softDeleteMessage(id)) return Response.json({ error: "消息不存在" }, { status: 404 });
  return Response.json({ deleted: id, unread: unreadCount() });
}
