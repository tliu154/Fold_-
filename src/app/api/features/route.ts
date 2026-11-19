/**
 * GET /api/features —— 模块开关与状态清单（阶段 0 实做）
 * 读取 src/features.ts 注册表
 */
import { requireAuth } from "@/lib/auth";
import { listFeatures } from "@/features";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  return Response.json({ features: listFeatures() });
}
