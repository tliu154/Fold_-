/**
 * /api/checkins —— 打卡记录列表与新增（一期 A4）
 * GET  [?limit=50] → { checkins[] }（按日期倒序）
 * POST { title, date, habit_id?, note? } → { checkin, created }
 *   - habit_id 非空：同一习惯同一天幂等，created=false 返回已有记录
 *   - habit_id 为空：随手记一条，独立记录、不参与连续天数
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createCheckin, listCheckins } from "@/lib/checkins";

const createSchema = z.object({
  title: z.string().trim().min(1, "请输入内容").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  habit_id: z.string().uuid().nullable().optional().default(null),
  note: z.string().max(1000).optional().default(""),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 500) : 50;
  return Response.json({ checkins: listCheckins(limit) });
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
  const result = createCheckin(parsed.data);
  return Response.json(result, { status: result.created ? 201 : 200 });
}
