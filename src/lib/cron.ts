/**
 * 定时任务注册（v0.6 骨架）
 * - 由 src/instrumentation.ts 在服务启动时调用
 * - 具体任务（每日重点 / 周报草稿 / 资讯订阅）属三期，按清单 3.1 走澄清门后再注册
 * - 骨架阶段不预设任何具体调度，避免写死时间 / 任务
 */
export function registerCronTasks(): void {
  // 三期实现定时任务时在这里注册；当前骨架阶段留空
  console.log("[cron] 定时任务骨架就绪（未注册任何具体任务）");
}
