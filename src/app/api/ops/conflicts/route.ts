/**
 * GET /api/ops/conflicts —— 冲突列表与人工合并数据（阶段 0 占位）
 * 规则（阶段 1 实现）：base_version 过期标 conflict，禁止自动合并
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("ops-conflicts");
}
