/**
 * GET /api/sources —— 数据源注册表（阶段 0 占位）
 * 返回 adapterRegistry 空注册表
 * TODO: 待澄清后实现——新数据源走 DataSourceAdapter 接口接入
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";
import { listAdapters } from "@/adapters/DataSourceAdapter";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // 阶段 0：注册表恒为空，只回空列表说明占位状态
  return Response.json({
    adapters: listAdapters(),
    note: "该功能待定义：数据源接入需先走澄清门并实现 DataSourceAdapter",
    status: "placeholder",
  });
}
