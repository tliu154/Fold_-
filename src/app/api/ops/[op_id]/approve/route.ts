/**
 * POST /api/ops/:op_id/approve —— 批准操作（阶段 0 占位）
 * 执行顺序铁律（阶段 1 实现，不可调换）：
 * 落 pending_ops → 审批 → 快照受影响数据 → 应用 op → 写 applied_ops 审计 → version+1
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
  return notImplemented("ops-approve");
}
