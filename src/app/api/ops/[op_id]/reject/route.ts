/**
 * POST /api/ops/:op_id/reject —— 驳回操作并记录原因（阶段 1 实装）
 * 驳回后移动端草稿留在本地（不自动重投），下次拉快照被主库状态覆盖
 * Body: {reason?: string}
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rejectOp } from "@/lib/sync";

const bodySchema = z.object({
  reason: z.string().max(200).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ op_id: string }> }
) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const { op_id } = await params;

  let reason: string | undefined;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (parsed.success) reason = parsed.data.reason;
  } catch {
    // 空 body 允许，用默认原因
  }

  const result = rejectOp(op_id, reason);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
