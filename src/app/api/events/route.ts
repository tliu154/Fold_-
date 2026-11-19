/**
 * /api/events —— 日程列表与新增（一期 A3）
 * GET  [?onlyDeleted=1] → { events[] }（正常按 date 升序，回收站按删除时间倒序）
 * POST { title, date, start?, end?, location?, content?, tags? } → { event }
 * - 存 items 表 type='event'；浏览器直连主库，无 op / 审批
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { createEvent, listEvents } from "@/lib/events";

const timeSchema = z
  .string()
  .refine((v) => v === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "时间格式应为 HH:mm 或留空");

const createSchema = z.object({
  title: z.string().trim().min(1, "请输入标题").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  start: timeSchema.optional().default(""),
  end: timeSchema.optional().default(""),
  location: z.string().max(200).optional().default(""),
  content: z.string().max(4000).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional().default([]),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const onlyDeleted = url.searchParams.get("onlyDeleted") === "1";
  const events = listEvents(onlyDeleted);
  if (!onlyDeleted) events.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  return Response.json({ events });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "events-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }
  return Response.json({ event: createEvent(parsed.data) }, { status: 201 });
}
