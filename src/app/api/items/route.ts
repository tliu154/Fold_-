/**
 * GET / POST / PATCH /api/items —— 电脑端工作台 CRUD（阶段 0 占位）
 * 注意：本路由已实做鉴权——未登录访问返回 401（阶段 0 验收项）
 * TODO: 待澄清后实现
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  // TODO: 待澄清后实现
  return notImplemented("items-get");
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  // TODO: 待澄清后实现
  return notImplemented("items-create");
}

export async function PATCH(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  // TODO: 待澄清后实现
  return notImplemented("items-update");
}
