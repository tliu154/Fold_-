/**
 * /api/scheduler —— 定时任务配置（三期 C1）
 * GET → { config, state, jobs, runtime }（纯读，不盘点、不写文件）
 * PUT { tasks[] } → 整份替换任务列表（增删改一次提交），返回 { config }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getSchedulerStatus, replaceTasks } from "@/lib/scheduler";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm（24 小时制）");
const scheduleSchema = z.object({
  kind: z.enum(["daily", "weekly"]),
  time: timeSchema,
  weekday: z.number().int().min(0).max(6).optional(),
}).refine((s) => s.kind !== "weekly" || s.weekday !== undefined, {
  message: "每周任务需要指定星期（0=周日 … 6=周六）", path: ["weekday"],
});
const taskSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().trim().min(1, "请输入任务名称").max(60),
  job: z.enum(["daily_focus", "inbox_scan", "weekly_digest", "proposal_scan"]),
  enabled: z.boolean(),
  schedule: scheduleSchema,
});
const putSchema = z.object({ tasks: z.array(taskSchema).max(20, "最多 20 个任务") });

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json(getSchedulerStatus());
}

export async function PUT(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "scheduler-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const cfg = replaceTasks(parsed.data.tasks);
  return Response.json({ config: cfg });
}
