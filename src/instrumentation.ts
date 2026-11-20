/**
 * Next.js instrumentation 钩子（三期 C1 接入真实调度）
 * 服务启动时注册定时任务（见 src/lib/cron.ts）；进程退出调度即停，不写任何系统启动项。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerCronTasks } = await import("./lib/cron");
    await registerCronTasks();
  }
}
