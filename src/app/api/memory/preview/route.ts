/**
 * GET /api/memory/preview?feature=chat —— 预览按映射组装的 system prompt（一期 A7）
 * 设置页预览 / e2e 校验用；不调用模型
 */
import { requireAuth } from "@/lib/auth";
import { previewPrompt } from "@/lib/memory";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const feature = new URL(req.url).searchParams.get("feature") ?? "chat";
  return Response.json(previewPrompt(feature));
}
