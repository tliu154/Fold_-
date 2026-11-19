/**
 * GET /api/ops/pending?status= —— 审批台列表（阶段 1 实装）
 * status 省略时返回全部（按创建时间倒序）；附目标条目标题与软删除状态
 */
import { requireAuth } from "@/lib/auth";
import { listOps, getDbVersion } from "@/lib/sync";

const ALLOWED_STATUS = ["pending", "conflict", "rejected", "approved", "duplicate"];

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const status = new URL(req.url).searchParams.get("status");
  if (status && !ALLOWED_STATUS.includes(status)) {
    return Response.json(
      { error: `status 取值须为：${ALLOWED_STATUS.join(" / ")}` },
      { status: 400 }
    );
  }

  const ops = listOps(status ?? undefined);
  return Response.json(
    { ops, db_version: getDbVersion() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
