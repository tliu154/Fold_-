/**
 * POST /api/sync/push —— 移动端投递操作请求（阶段 0 占位）
 * 契约：{device_id, ops[]} → 逐条 status + snapshot_version
 * 服务端规则（阶段 1 实现）：幂等（op_id 重复返回 duplicate）、
 * base_version 不匹配标 conflict、批准前主库不得变化、delete 永远人工批准
 * TODO: 待澄清后实现（阶段 1 前先走澄清门）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("sync-push");
}
