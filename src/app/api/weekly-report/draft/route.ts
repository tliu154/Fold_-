/**
 * POST /api/weekly-report/draft —— 生成周报草稿（阶段 0 占位）
 * 铁律：只生成草稿、不自动发布
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("weekly-report-draft");
}
