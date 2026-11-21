/**
 * 定时任务注册（三期 C1 接入）
 *
 * - 由 src/instrumentation.ts 在服务启动时 await 调用
 * - 复用已装的 node-cron：每 60 秒一次 runTick()，由调度器自行判断谁该跑
 * - 启动立即盘点一次：服务停机期间的应跑时刻全部计为「错过」，**不补跑**
 * - **不动系统**：不写注册表 / 任务计划 / Windows 服务，进程退出调度即停
 * - 用 globalThis 标记防 Next.js dev 热重载重复注册
 */
const G = globalThis as typeof globalThis & { __foldCronStarted?: boolean };

export async function registerCronTasks(): Promise<void> {
  if (G.__foldCronStarted) return;
  G.__foldCronStarted = true;

  try {
    const { runTick } = await import("./scheduler");
    // node-cron 是 CJS：dynamic import 在不同打包方式下可能挂到 default 上
    type CronApi = { schedule: (expression: string, fn: () => void) => unknown };
    const mod = await import("node-cron");
    const maybe = mod as unknown as CronApi & { default?: CronApi };
    const cron: CronApi = maybe.default ?? maybe;

    // 开机盘点：错过次数只看不补，站内消息会汇总一次
    const boot = await runTick();
    console.log(`[cron] 启动盘点完成，错过 ${boot.missed} 次，本次执行 ${boot.ran.length} 个任务`);

    cron.schedule("* * * * *", () => {
      void runTick().catch((e) => console.error("[cron] tick 失败：", e));
      // C3 第 3 轮：资讯定时订阅走自己的调度状态（按天幂等），
      // 不往 scheduler 的 4 个内置任务里加第 5 个，避免影响已验收断言。
      // 抓取失败在 news 模块内如实标注，绝不让异常打断调度器。
      void import("./news")
        .then((m) => m.runNewsSchedule())
        .catch((e) => console.error("[cron] 资讯订阅失败：", e));
    });
    console.log("[cron] 定时任务已注册（每 60 秒盘点一次，服务进程内运行）");
  } catch (e) {
    // 注册失败不能拖垮服务本身；下次访问 /api/scheduler/tick 仍可手动盘点
    G.__foldCronStarted = false;
    console.error("[cron] 定时任务注册失败：", e);
  }
}
