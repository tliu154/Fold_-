/**
 * /api/scheduler/run —— 手动「立即运行」（三期 C1）
 * POST { task_id } → 与定时触发走同一个 executeJob，生成一条站内消息
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runTaskNow, readState } from "@/lib/scheduler";

const schema = z.object({ task_id: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "scheduler-run"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "task_id 不合法" }, { status: 400 });
  try {
    const message = await runTaskNow(parsed.data.task_id);
    return Response.json({ message, state: readState() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
