/**
 * /api/goals —— 长期目标列表与新增（一期 A5）
 * GET  → { goals[] }（读本地配置 data/goals.json，按创建时间倒序）
 * POST { title, description?, target_date?, status?, progress? } → { goal }
 * - 不进 SQLite 主库；无 watcher，外部改文件需刷新
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createGoal, listGoals } from "@/lib/goals";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "目标日期格式应为 YYYY-MM-DD").nullable();
const statusSchema = z.enum(["active", "done", "paused"]);
const progressSchema = z.number().int().min(0).max(100);

const createSchema = z.object({
  title: z.string().trim().min(1, "请输入目标标题").max(200),
  description: z.string().max(4000).optional().default(""),
  target_date: dateSchema.optional().default(null),
  status: statusSchema.optional().default("active"),
  progress: progressSchema.optional().default(0),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ goals: listGoals() });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "goals-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  return Response.json({ goal: await createGoal(parsed.data) }, { status: 201 });
}
