/**
 * /api/scheduler/tick —— 手动触发一次调度盘点（三期 C1，验收/排障用）
 * POST → 与 cron.ts 每 60 秒自动调用的是同一个 runTick()：
 * 刚到点的任务执行一次，停机期间应跑未跑的只累加 missed_count、绝不补跑。
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runTick, readState } from "@/lib/scheduler";

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "scheduler-tick"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const result = runTick();
  return Response.json({ result, state: readState() });
}
