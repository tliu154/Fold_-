/**
 * POST /api/chat/send —— 发送消息（一期 A6）
 * { mode: "temp"|"normal", session_id?, message }
 *   - temp   ：Stateless，不落库，返回 session_id=null
 *   - normal ：必带 session_id，落库用户消息+回复，带最近 10 轮上下文
 * 一次性返回文本（非流式）；不做 ai_usage 记账 / 预算 / AI 专用限流
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { sendMessage } from "@/lib/chat";

const bodySchema = z.object({
  mode: z.enum(["temp", "normal"]),
  session_id: z.string().uuid().optional(),
  message: z.string().trim().min(1, "消息不能为空").max(8000),
}).refine((v) => v.mode === "temp" || Boolean(v.session_id), {
  message: "普通模式必须提供 session_id",
  path: ["session_id"],
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const result = await sendMessage(parsed.data);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "对话失败" },
      { status: 502 }
    );
  }
}
