/**
 * POST /api/butler/ask —— AI 管家问答（一期 A9）
 * { question, mode: "stateless"|"session", session_id? }
 *   - stateless：无状态，不落库、不留会话
 *   - session  ：复用 A6 会话壳带上下文、落库
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { butlerAsk } from "@/lib/butler";

const schema = z.object({
  question: z.string().trim().min(1, "请输入问题").max(8000),
  mode: z.enum(["stateless", "session"]),
  session_id: z.string().uuid().optional(),
}).refine((v) => v.mode === "stateless" || Boolean(v.session_id), {
  message: "会话模式必须提供 session_id",
  path: ["session_id"],
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
    return Response.json(await butlerAsk(parsed.data));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "管家调用失败" },
      { status: 502 }
    );
  }
}
