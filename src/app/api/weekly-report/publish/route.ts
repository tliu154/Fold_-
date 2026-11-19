/**
 * POST /api/weekly-report/publish —— 人工批准后发布周报（阶段 0 占位）
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("weekly-report-publish");
}
