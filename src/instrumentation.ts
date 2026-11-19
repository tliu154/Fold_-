/**
 * Next.js instrumentation 钩子（阶段 0）
 * 服务启动时注册定时任务占位（见 src/lib/cron.ts）
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerCronPlaceholders } = await import("./lib/cron");
    registerCronPlaceholders();
  }
}
