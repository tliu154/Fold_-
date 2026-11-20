/**
 * /api/scheduler/parse —— 自然语言定时描述解析（三期 C1）
 * POST { text } → 调一次已有的 callStructured 输出同一份调度配置
 *
 * **只返回预览、绝不落库**；用户点「确认添加」后另走 PUT /api/scheduler 才保存。
 * 模型不可用（含 429 余额不足）→ 502 + model_unavailable=true，如实回报，不用 mock 假装成功。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { parseSchedule } from "@/lib/scheduler";

const schema = z.object({ text: z.string().trim().min(1, "请输入定时描述").max(200) });

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "scheduler-parse"), 20, 60_000)) {
    return Response.json({ error: "解析过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    return Response.json({ parsed: await parseSchedule(parsed.data.text) });
  } catch (e) {
    const msg = (e as Error).message;
    const unavailable = /余额|429|rate|quota|模型调用失败|结构化|fetch|ECONN|timeout/i.test(msg);
    return Response.json(
      { error: `自然语言解析未通过：${msg}。可改用下方的结构化选时，不影响其它功能。`, model_unavailable: unavailable },
      { status: unavailable ? 502 : 422 }
    );
  }
}
