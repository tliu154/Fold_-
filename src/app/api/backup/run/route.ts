/**
 * POST /api/backup/run —— 快照 + 加密备份（阶段 0 占位）
 * 规则（阶段 1+ 实现）：同步 ≠ 备份；restic/kopia 加密到外置盘或对象存储；
 * 提供恢复演练脚本
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("backup-run");
}
