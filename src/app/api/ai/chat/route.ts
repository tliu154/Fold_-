/**
 * POST /api/ai/chat —— AI 对话（阶段 0 占位）
 * 契约（阶段 1+ 实现）：SSE 流式；OpenAI 兼容接口（MODEL_NAME / MODEL_BASE_URL /
 * MODEL_API_KEY 全走环境变量）；每次注入统一人设 profile + 命中记忆片段；
 * API Key 只存服务端 .env；ai_usage 记录用量；月度预算超限拒绝
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("ai-chat");
}
