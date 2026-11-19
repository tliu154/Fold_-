/**
 * API 工具函数（阶段 0）
 */

/** 占位路由统一响应：501 + 中文提示（留空规则 3.2） */
export function notImplemented(feature: string, note = "该功能待定义"): Response {
  return Response.json(
    { error: note, feature, status: 501 },
    { status: 501 }
  );
}
