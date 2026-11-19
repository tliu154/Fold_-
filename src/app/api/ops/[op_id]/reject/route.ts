/**
 * POST /api/ops/:op_id/reject —— 驳回操作并记录原因（阶段 0 占位）
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ op_id: string }> }
) {
  const denied = requireAuth(req);
  if (denied) return denied;

  await params; // 阶段 0 仅解析占位，不使用
  // TODO: 待澄清后实现
  return notImplemented("ops-reject");
}
