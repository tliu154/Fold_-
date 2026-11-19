/**
 * /api/habits —— 习惯列表与新增（一期 A4）
 * GET  [?onlyDeleted=1] → { habits[] }（正常含 streak/todayDone/lastDate，回收站为原始列表）
 * POST { title, tags? } → { habit }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createHabit, listHabitViews, listHabits } from "@/lib/checkins";

const createSchema = z.object({
  title: z.string().trim().min(1, "请输入习惯名称").max(200),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional().default([]),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const onlyDeleted = new URL(req.url).searchParams.get("onlyDeleted") === "1";
  return Response.json({
    habits: onlyDeleted ? listHabits(true) : listHabitViews(),
  });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "checkins-write"), 90, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  return Response.json({ habit: createHabit(parsed.data.title, parsed.data.tags) }, { status: 201 });
}
