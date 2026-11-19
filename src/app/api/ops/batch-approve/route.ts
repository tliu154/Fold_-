/**
 * POST /api/ops/batch-approve —— 批量批准（阶段 1 新增，规格第 6 条）
 * Body: {op_ids: string[]}
 * 逐条走完整流程（快照 → 应用 → 审计 → version+1），任一条失败不影响其余
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { approveOp, getDbVersion } from "@/lib/sync";

const bodySchema = z.object({
  op_ids: z.array(z.string().min(1)).min(1, "op_ids 不能为空").max(100, "单次最多 100 条"),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (!rateLimit(clientKey(req, "ops-batch"), 30, 60_000)) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }

  const results = parsed.data.op_ids.map((op_id) => {
    const r = approveOp(op_id);
    return {
      op_id,
      ok: r.ok,
      applied: r.applied,
      error: r.error,
      reject_reason: r.reject_reason,
    };
  });

  return Response.json({ results, db_version: getDbVersion() });
}
