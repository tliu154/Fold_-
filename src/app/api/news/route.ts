/**
 * /api/news —— 资讯订阅只读列表（三期 C3 第 3 轮）
 * GET { items, topics, schedule, model, limits }
 */
import { requireAuth } from "@/lib/auth";
import { listFeed } from "@/lib/news";
import { getNewsConfig, NEWS_LIMITS } from "@/lib/news-topics";
import { getSearchModel } from "@/lib/config";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const cfg = getNewsConfig();
  const m = getSearchModel();
  // 密钥绝不回显，只告诉前端是否配置
  return Response.json({
    items: listFeed(100),
    topics: cfg.topics,
    schedule: cfg.schedule,
    limits: NEWS_LIMITS,
    model: {
      configured: Boolean(m.apiKey && m.baseUrl && m.model),
      id: m.model || null,
      base: m.baseUrl || null,
      capability: "qwen_web_search",
      source_url_note: "该端点不返回可核验来源 URL；仅保留响应中真实出现的链接，否则标注未提供",
    },
  });
}
