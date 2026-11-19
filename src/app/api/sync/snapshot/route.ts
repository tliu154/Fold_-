/**
 * GET /api/sync/snapshot?device_id= —— 只读快照下发（阶段 0 占位）
 * 契约：{version, items[], profile{}, generated_at}
 * 规则（阶段 1 实现）：移动端拉取后整体替换本地缓存，不做增量合并
 * TODO: 待澄清后实现（阶段 1 前先走澄清门）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("sync-snapshot");
}
