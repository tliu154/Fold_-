/**
 * /api/news/fetch —— 手动「获取资讯」按钮（三期 C3 第 3 轮）
 * POST { topicId?, useAi? } → 1 次真实 Qwen 联网调用；失败如实标 status，不 mock。
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { fetchAllNews, listFeed } from "@/lib/news";

const schema = z.object({
  topicId: z.string().trim().min(1).max(60).optional(),
  useAi: z.boolean().optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "news-fetch"), 10, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown = {};
  try { body = await req.json(); } catch { /* 空体用默认值 */ }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  if (parsed.data.useAi === false) {
    // 显式关闭模型：不调用、不写 feed，如实回报（供验收／省费用）
    return Response.json({ ok: false, status: "model_unavailable", results: [], items: listFeed(100),
      note: "useAi:false，本次未调用模型，也未写入任何资讯条目" });
  }
  try {
    const results = await fetchAllNews({ sourcePrefix: "manual", topicId: parsed.data.topicId });
    return Response.json({
      ok: results.length > 0 && results.every((r) => r.ok),
      status: results.length ? results[0].status : "model_unavailable",
      results, items: listFeed(100),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
