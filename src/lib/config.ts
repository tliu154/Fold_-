/**
 * 环境变量统一读取（v0.6 骨架）
 * 所有配置只从 .env / 环境读取，绝不写死在代码里
 */
import path from "node:path";

export function getAuthPassword(): string {
  return process.env.AUTH_PASSWORD ?? "";
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? "";
}

/** SQLite 主库根目录（绝对路径） */
export function getDataDir(): string {
  const raw = process.env.DATA_DIR ?? "./data";
  return path.resolve(process.cwd(), raw);
}

/** 模型路由配置（v0.6 清单 1.5：一期先 DeepSeek，框架留好三模型） */
export interface ModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** 日常任务模型（管家/周报/摘要/记下来）——一期 DeepSeek */
export function getDailyModel(): ModelConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
  };
}

/** 联网资讯模型（Qwen 内置联网）——二/三期接入 */
export function getSearchModel(): ModelConfig {
  return {
    apiKey: process.env.QWEN_API_KEY ?? "",
    baseUrl: process.env.QWEN_BASE_URL ?? "",
    model: process.env.QWEN_MODEL ?? "",
  };
}

/** 重型推理模型（GLM / Qwen-Max）——二/三期接入 */
export function getReasoningModel(): ModelConfig {
  return {
    apiKey: process.env.REASONING_API_KEY ?? "",
    baseUrl: process.env.REASONING_BASE_URL ?? "",
    model: process.env.REASONING_MODEL ?? "",
  };
}

export function getMonthlyBudget(): number {
  const raw = Number(process.env.AI_MONTHLY_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : 0; // 0 = 不限制
}

export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}
