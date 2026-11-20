/**
 * GET /api/libraries/projects —— 项目库 STATUS.md 进度列表（二期 B1，只读）
 */
import { requireAuth } from "@/lib/auth";
import { listProjects } from "@/lib/projects";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json(listProjects());
}
