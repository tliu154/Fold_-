/**
 * POST /api/ops/:op_id/approve —— 批准操作（阶段 1 实装）
 * 执行顺序铁律（不可调换）：
 *   快照受影响数据（行级 JSON）→ 应用 op → 写 applied_ops 审计（含快照路径）
 *   → 全库 version+1
 * delete 类 op 同样走此流程（软删除），批准后可从快照/墓碑恢复
 */
import { requireAuth } from "@/lib/auth";
import { approveOp } from "@/lib/sync";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ op_id: string }> }
) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const { op_id } = await params;

  const result = approveOp(op_id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
