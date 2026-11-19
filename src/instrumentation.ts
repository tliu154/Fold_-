/**
 * Next.js instrumentation 钩子（v0.6 骨架）
 * 服务启动时初始化定时任务骨架（见 src/lib/cron.ts）
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerCronTasks } = await import("./lib/cron");
    registerCronTasks();
  }
}
