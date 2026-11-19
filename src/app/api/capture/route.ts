/**
 * POST /api/capture —— 统一收件箱（阶段 0 占位）
 * 契约（阶段 1+ 实现）：接收任意碎片 → LLM 分类路由 → item / op 草稿
 * TODO: 待澄清后实现（细节：分类枚举、置信度、fallback 策略等均不提前写死）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("capture");
}
