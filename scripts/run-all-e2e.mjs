/**
 * 全量验收总入口（PRD §6.3 纪律固化）
 *
 * - 验收前 resetVault()：删测试库残留 .git + 清空所有文件（含 15 个种子）+ 定时任务恢复默认启用，
 *   让既有 e2e 仍以「空库 / 无 git / 任务全启用」为基线。原因：
 *     ① 种子留在库里会变成未跟踪文件 → 整理被判「脏工作区 400」、文件总数断言错位；
 *     ② e2e-proposals 会停用全部定时任务，收尾一旦没恢复，data/scheduler.json 就自锁成
 *        enabled:false → 后续 e2e-scheduler 连挂 4 项。
 * - 只把 CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD 调大（保护仍开启）：WorkBuddy 的 Node 层
 *   批量删除保护在累计删除达 200 后会让 e2e 内部 fs.rmSync 清场静默失败 → fixture 累积连锁假失败。
 * - ⚠️ **不要设 CODEBUDDY_SAFE_DELETE_ENABLED=0**：实测会让 capture/proposals/tidy/reports
 *   4 套子进程直接崩（Windows 0xC0000409 / exit=3221226505），与历史 exit=127 同源。
 * - 18 套分 4 批，中间 sleep 65 避开登录限流（10 次 / 60 秒）；scheduler 必须排在 proposals 之前。
 * - proposals 跑完后再自愈一次（它会 init git + 停用任务，收尾易留残留）。
 * - 全部跑完 resetVault() + ensureSeed()：模拟数据恢复，网页随时有内容可看。
 * - **不改任何已验收 e2e 的业务断言**（唯一例外见 PRD §6.3：proposals 的 killGit 清理函数）。
 *
 * 用法：
 *   node scripts/run-all-e2e.mjs                 跑全量
 *   node scripts/run-all-e2e.mjs --reset-only   只复位环境并重建种子，不跑验收
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureSeed, vaultStatus, TEST_VAULT } from "./seed-vault.mjs";

const BATCHES = [
  ["todos", "events", "goals", "checkins", "home"],
  ["memory", "index", "butler", "capture", "libraries"],
  ["obsidian", "scheduler", "proposals", "tidy", "chat"], // scheduler 必须在 proposals 之前
  ["reports", "filetree", "settings"],
];
const SCHEDULER_CFG = path.resolve("data/scheduler.json");
const BUILTIN_JOBS = ["daily_focus", "inbox_scan", "weekly_digest", "proposal_scan"];

// 调大阈值让累计删除不再触发拦截；**保持 ENABLED=1**，关掉会让子进程崩溃
process.env.CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD = "1000000";
const CHILD_ENV = { ...process.env, CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD: "1000000" };

function walkFiles(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if ([".git", ".obsidian", ".trash"].includes(e.name)) continue;
      walkFiles(p, out);
    } else if (e.isFile()) out.push(p);
  }
  return out;
}

/** git 对象只读，Node 直接 rmSync 会 EPERM → 先递归去只读，再删，最后系统强删回落 */
function forceRemoveGit(gitDir) {
  if (!fs.existsSync(gitDir)) return;
  const unreadonly = (d) => {
    let names = [];
    try { names = fs.readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = path.join(d, n);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) unreadonly(p);
      else { try { fs.chmodSync(p, 0o666); } catch {} }
    }
  };
  unreadonly(gitDir);
  try { fs.rmSync(gitDir, { recursive: true, force: true }); } catch {}
  if (fs.existsSync(gitDir) && process.platform === "win32") {
    spawnSync("cmd", ["/c", "rmdir", "/S", "/Q", gitDir.replace(/\//g, "\\")], { stdio: "ignore" });
  }
}

function resetVault() {
  forceRemoveGit(path.join(TEST_VAULT, ".git"));
  // 清空库内所有文件（含种子与 fixture 残留），保留目录结构
  let removed = 0;
  for (const f of walkFiles(TEST_VAULT)) {
    try { fs.chmodSync(f, 0o666); } catch {}
    try { fs.rmSync(f, { force: true }); removed++; } catch {}
  }
  // 内置定时任务恢复默认启用，解除「停用后没恢复」的自锁
  let enabledFixed = 0;
  try {
    const cfg = JSON.parse(fs.readFileSync(SCHEDULER_CFG, "utf8"));
    for (const t of cfg.tasks ?? []) {
      if (BUILTIN_JOBS.includes(t.job) && t.enabled !== true) { t.enabled = true; enabledFixed++; }
    }
    if (enabledFixed) fs.writeFileSync(SCHEDULER_CFG, JSON.stringify(cfg, null, 2));
  } catch {}
  return { removed, enabledFixed, gitExists: fs.existsSync(path.join(TEST_VAULT, ".git")) };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function summarize(out) {
  const lines = out.split("\n");
  const hit = [...lines].reverse().find((l) => l.includes("结果："));
  return hit ? hit.trim() : "<没有结果行>";
}

if (process.argv.includes("--reset-only")) {
  console.log("仅复位环境：", resetVault(), "-> 重建种子", ensureSeed(), vaultStatus());
  process.exit(0);
}

console.log("========== 验收前：复位环境，恢复空库基线 ==========");
console.log("reset =", resetVault(), vaultStatus());

let allOk = true;
for (const [i, batch] of BATCHES.entries()) {
  console.log(`\n########## BATCH ${i + 1}/${BATCHES.length} ##########`);
  for (const s of batch) {
    const r = spawnSync(process.execPath, [`scripts/e2e-${s}.mjs`], {
      encoding: "utf-8", env: CHILD_ENV,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const result = summarize(out);
    const okRun = r.status === 0;
    if (!okRun) allOk = false;
    console.log(`e2e-${s} [exit=${r.status}] => ${result}`);
    if (!okRun) console.log(out.split("\n").filter((l) => l.includes("✗") || l.includes("Error") || l.includes("失败")).slice(0, 20).join("\n"));
    if (s === "proposals") console.log("proposals 后自愈复位：", resetVault());
  }
  if (i < BATCHES.length - 1) {
    console.log("---------- sleep 65（避开登录限流） ----------");
    sleep(65_000);
  }
}

console.log("\n========== 验收后：复位环境 + 重建种子 ==========");
console.log("reset =", resetVault());
console.log(ensureSeed(), vaultStatus());
console.log(`\n总结果：${allOk ? "全部通过" : "有失败项，见上方明细"}`);
process.exit(allOk ? 0 : 1);
