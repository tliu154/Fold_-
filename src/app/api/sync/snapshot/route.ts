/**
 * GET /api/sync/snapshot?device_id= —— 只读快照下发（阶段 1 实装）
 * 契约：{version, items[], profile{}, generated_at}
 * - 排除软删除条目（deleted_at IS NULL）
 * - 移动端拉取后整体替换本地缓存，不做增量合并、不做冲突自动解决
 * - device_id 参数仅用于日志/统计，不影响内容
 */
import { requireAuth } from "@/lib/auth";
import { buildSnapshot, getDbVersion } from "@/lib/sync";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const deviceId = new URL(req.url).searchParams.get("device_id");
  if (deviceId) {
    // 仅记录访问，不参与数据组装（保持只读语义）
    console.log(`[snapshot] device ${deviceId} 拉取快照 version=${getDbVersion()}`);
  }

  const snapshot = buildSnapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
