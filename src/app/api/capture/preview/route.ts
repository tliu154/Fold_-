/**
 * POST /api/capture/preview —— 记下来前预览：拼对话 + 调一次 AI 出标题/标签建议
 * { session_id, message_ids } → { dialogue, suggestion, already_saved }
 * 不落库，可在保存时用用户改过的 title/tags
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { alreadyCaptured, buildDialogue, suggestMeta } from "@/lib/capture";

const schema = z.object({
  session_id: z.string().uuid(),
  message_ids: z.array(z.string()).min(1, "请至少勾选一轮对话").max(50),
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
  const built = buildDialogue(parsed.data.session_id, parsed.data.message_ids);
  if (!built) return Response.json({ error: "会话或勾选的消息不存在" }, { status: 404 });
  const dup = alreadyCaptured(parsed.data.session_id, parsed.data.message_ids);
  try {
    const suggestion = await suggestMeta(built.text);
    return Response.json({ dialogue: built.text, suggestion, already_saved: dup });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "生成建议失败", dialogue: built.text, suggestion: null },
      { status: 502 }
    );
  }
}
