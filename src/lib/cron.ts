/**
 * 定时任务注册（阶段 0：仅空调度占位，不写真实任务）
 * - 由 src/instrumentation.ts 在服务启动时调用
 * - 阶段 1+ 补实前必须先走功能澄清门（3.1）
 */
import cron from "node-cron";

let registered = false;

export function registerCronPlaceholders(): void {
  if (registered) return;
  registered = true;

  // TODO: 待澄清后实现——每日重点推送（阶段 1+ 前先走澄清门）
  cron.schedule("0 8 * * *", () => {
    console.log("[cron][占位] 每日推送（8:00）——该功能待定义，未执行任何操作");
  });

  // TODO: 待澄清后实现——周报草稿生成
  cron.schedule("0 8 * * 1", () => {
    console.log("[cron][占位] 周报草稿（周一 8:00）——该功能待定义，未执行任何操作");
  });

  // TODO: 待澄清后实现——加密备份（restic/kopia）
  cron.schedule("0 3 * * 0", () => {
    console.log("[cron][占位] 每周备份（周日 3:00）——该功能待定义，未执行任何操作");
  });

  // TODO: 待澄清后实现——墓碑归档清理（保留 90 天）
  cron.schedule("0 4 * * *", () => {
    console.log("[cron][占位] 墓碑清理（4:00）——该功能待定义，未执行任何操作");
  });

  console.log("[cron] 已注册 4 个占位调度（均为空任务，见 src/lib/cron.ts）");
}
