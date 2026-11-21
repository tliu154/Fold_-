/**
 * /api/news/topics —— 订阅主题 + 定时开关（三期 C3 第 3 轮）
 * GET → { topics, schedule, limits }
 * PUT → 手动改：与管家草案共用 validateNewsConfig()；非法整批拒绝，不写半个值
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getNewsConfig, setNewsConfig, validateNewsConfig, NEWS_LIMITS } from "@/lib/news-topics";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const cfg = getNewsConfig();
  return Response.json({ topics: cfg.topics, schedule: cfg.schedule, limits: NEWS_LIMITS,
    updated_at: cfg.updated_at });
}

export async function PUT(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "news-topics"), 20, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const v = validateNewsConfig(body);
  if (!v.ok) return Response.json({ error: v.errors.join("；"), errors: v.errors }, { status: 400 });
  const saved = setNewsConfig(v.value!);
  return Response.json({ ok: true, topics: saved.topics, schedule: saved.schedule,
    updated_at: saved.updated_at });
}
