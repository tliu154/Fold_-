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

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
