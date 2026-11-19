/**
 * POST /api/ai/save-answer —— 存为笔记（阶段 0 占位）
 * 铁律：仅由前端「存为笔记」按钮调用；默认不存、不自动存、不批量存、
 * 不弹窗催；点击后写 items(type='note')、回填 ai_messages.saved_as_item_id、幂等
 * TODO: 待澄清后实现（实现前按 9.1 先问一次）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("ai-save-answer");
}
