/**
 * GET /api/ops/pending?status= —— 审批台列表（阶段 0 占位）
 * TODO: 待澄清后实现（阶段 1 前先走澄清门）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("ops-pending");
}
