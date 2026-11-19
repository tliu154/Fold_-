/**
 * 环境变量统一读取（阶段 0）
 * 所有配置只从 .env / 环境读取，绝不写死在代码里
 */
import path from "node:path";

export function getAuthPassword(): string {
  return process.env.AUTH_PASSWORD ?? "";
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

/** SQLite 主库与 Markdown 仓库根目录（绝对路径） */
export function getDataDir(): string {
  const raw = process.env.DATA_DIR ?? "./data";
  return path.resolve(process.cwd(), raw);
}

/** create 类 op 是否自动批准（阶段 1）；delete 永远人工批准，此开关无效 */
export function getAutoApproveCreate(): boolean {
  return (process.env.AUTO_APPROVE_CREATE ?? "false").toLowerCase() === "true";
}

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
