/**
 * GET /api/ops/conflicts —— 冲突列表与人工合并数据（阶段 1 实装）
 * 返回每条冲突 op 的客户端 payload 与服务端当前条目，供人工比对；
 * 解决入口：POST /api/ops/:op_id/resolve（以主库为准 / 以移动端为准）
 */
import { requireAuth } from "@/lib/auth";
import { listConflicts, getDbVersion } from "@/lib/sync";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const conflicts = listConflicts();
  return Response.json(
    { conflicts, db_version: getDbVersion() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
