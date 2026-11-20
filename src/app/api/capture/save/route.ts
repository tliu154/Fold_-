/**
 * POST /api/capture/save —— 保存「记下来」（一次点击 = 一条 item）
 * { session_id, message_ids, title?, tags?, suggestion? } → { item }
 * 幂等：同会话+同批消息已存过 → 409
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { saveCapture } from "@/lib/capture";

const schema = z.object({
  session_id: z.string().uuid(),
  message_ids: z.array(z.string()).min(1).max(50),
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  suggestion: z.object({
    title: z.string().max(200),
    tags: z.array(z.string().max(32)).max(10),
  }).optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const item = saveCapture(parsed.data);
    return Response.json({ item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return Response.json({ error: msg }, { status: msg.includes("已记下来") ? 409 : 400 });
  }
}
