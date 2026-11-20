/**
 * 三期 C1：定时任务调度 + 站内消息 端到端验收
 * 用法：先启动服务，再 node scripts/e2e-scheduler.mjs
 *
 * 覆盖：401 → 配置读写/校验 → 自然语言解析预览不落库 → 手动运行三任务 →
 *       消息已读/未读/删除 → 错过不补跑只记次数 → 自动 tick 真的在跑 →
 *       不碰真实库 / 不写测试库文件 → 收尾恢复配置并清理消息
 *
 * 模型：本脚本只做 **1 次** 最小真实调用验证解析链路（用户 2026-11-20 明确要求
 *       「能跑通就行」）。若模型 429 / 不可用，如实标注「真实解析链路未验证」，
 *       不用 mock 假装成功，也不算失败、不卡住其它断言。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = process.cwd();
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? "./data");
const CFG_FILE = path.join(DATA, "scheduler.json");
const STATE_FILE = path.join(DATA, "scheduler-state.json");
const DB_FILE = path.join(DATA, "fold.sqlite");
const TEST_POSIX = "D:/我的知识库测试";
const REAL_POSIX = "D:/我的知识库";
const WAIT_TICK = process.env.WAIT_TICK !== "0"; // 等 66 秒验证 cron 自动 tick

let token = "";
let passed = 0, failed = 0, skipped = 0;
let modelVerified = false;

function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
function skip(name, why) {
  skipped++;
  console.log(`  ⚠ ${name} —— ${why}`);
}
async function api(p, options = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function post(p, body) { return api(p, { method: "POST", body: JSON.stringify(body) }); }
function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null; }
function write(p, content) { if (content === null) { try { fs.unlinkSync(p); } catch {} } else fs.writeFileSync(p, content, "utf-8"); }
// 真实库内含 develop/Fold_ 项目自身（node_modules 数万文件）；
// .obsidian 是 Obsidian 常驻进程自己写的运行时状态（workspace.json 每几十秒变一次），
// 不属于知识内容，必须排除，否则「零接触」断言会被外部程序误伤。
const SNAPSHOT_SKIP = new Set([
  ".git", "node_modules", ".next", "develop", "data",
  "data.e2e-backup-20261119", ".obsidian", ".trash",
]);
function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    // 真实库内含 develop/Fold_ 项目自身（node_modules 数万文件），快照必须跳过
    if (SNAPSHOT_SKIP.has(name)) continue;
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...allFiles(p));
    else out.push(`${p}|${st.mtimeMs}|${st.size}`);
  }
  return out;
}
function snapshot(dir) { return allFiles(dir).sort().join("\n"); }
function diffSnapshot(a, b) {
  const A = new Set(a.split("\n")), B = new Set(b.split("\n"));
  const changed = [...A].filter((x) => x && !B.has(x)).concat([...B].filter((x) => x && !A.has(x)));
  return changed.slice(0, 5).map((x) => x.split("|")[0]).join(" | ") || "(无差异明细)";
}
function db() { return new Database(DB_FILE); }

async function main() {
  console.log(`定时任务 + 站内消息 端到端验收 ${BASE}`);

  // ---------- 备份 ----------
  const cfgBackup = read(CFG_FILE);
  const stateBackup = read(STATE_FILE);
  const realBefore = snapshot(REAL_POSIX);
  const testBefore = snapshot(TEST_POSIX);
  const d0 = db();
  const initialIds = (d0.prepare("SELECT id FROM items WHERE type = 'message'").all()).map((r) => r.id);
  d0.close();

  // ---------- 401 ----------
  ok("未登录 GET /api/scheduler → 401", (await api("/api/scheduler")).status === 401);
  ok("未登录 PUT /api/scheduler → 401", (await api("/api/scheduler", { method: "PUT", body: "{}" })).status === 401);
  ok("未登录 POST /api/scheduler/run → 401", (await post("/api/scheduler/run", {})).status === 401);
  ok("未登录 POST /api/scheduler/parse → 401", (await post("/api/scheduler/parse", { text: "每天九点" })).status === 401);
  ok("未登录 POST /api/scheduler/tick → 401", (await api("/api/scheduler/tick", { method: "POST" })).status === 401);
  ok("未登录 GET /api/messages → 401", (await api("/api/messages")).status === 401);
  ok("未登录 PATCH /api/messages → 401", (await api("/api/messages", { method: "PATCH", body: "{}" })).status === 401);
  ok("未登录 DELETE /api/messages → 401", (await api("/api/messages?id=x", { method: "DELETE" })).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // ---------- 初始状态 ----------
  const s0 = await api("/api/scheduler");
  ok("GET /api/scheduler → 200", s0.status === 200, JSON.stringify(s0.data).slice(0, 200));
  const tasks0 = s0.data.config?.tasks ?? [];
  ok("配置含 4 个内置任务（C2 增「生成整理提案」）", tasks0.length === 4, JSON.stringify(tasks0.map((t) => t.job)));
  ok("原三个 job 齐全（每日重点/未整理巡检/每周小结）",
    ["daily_focus", "inbox_scan", "weekly_digest"].every((j) => tasks0.some((t) => t.job === j)),
    JSON.stringify(tasks0.map((t) => t.job)));
  ok("C2 新增 proposal_scan 内置任务", tasks0.some((t) => t.job === "proposal_scan"),
    JSON.stringify(tasks0.map((t) => t.job)));
  ok("默认全部启用", tasks0.every((t) => t.enabled === true));
  ok("AI 评述本轮关闭（占位不做）", s0.data.runtime?.ai_commentary_enabled === false);
  ok("runtime 说明服务进程内调度", typeof s0.data.runtime?.note === "string" && s0.data.runtime.note.includes("不动系统"));
  ok("jobs 目录返回 4 项", (s0.data.jobs ?? []).length === 4);
  const m0 = await api("/api/messages");
  ok("GET /api/messages → 200", m0.status === 200 && Array.isArray(m0.data.messages));
  ok("返回 unread 计数", typeof m0.data.unread === "number");

  // ---------- 任务 CRUD + 参数校验 ----------
  const originalTasks = tasks0.map((t) => ({ ...t, schedule: { ...t.schedule } }));
  const toInput = (t) => ({ id: t.id, name: t.name, job: t.job, enabled: t.enabled, schedule: t.schedule });
  const extra = {
    id: "e2e-task-extra", name: "验收用任务", job: "daily_focus", enabled: true,
    schedule: { kind: "daily", time: "23:58" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const put1 = await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: [...originalTasks.map(toInput), toInput(extra)] }) });
  ok("PUT 新增任务 → 200", put1.status === 200, JSON.stringify(put1.data).slice(0, 200));
  ok("回读含新任务", (put1.data.config?.tasks ?? []).some((t) => t.id === extra.id));
  const g1 = await api("/api/scheduler");
  ok("GET 回读任务数 = 5", (g1.data.config?.tasks ?? []).length === 5);

  const edited = { ...toInput(extra), name: "验收用任务（改名）", enabled: false, schedule: { kind: "weekly", time: "07:30", weekday: 3 } };
  const put2 = await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: [...originalTasks.map(toInput), edited] }) });
  const e2 = (put2.data.config?.tasks ?? []).find((t) => t.id === extra.id);
  ok("PUT 编辑任务 → 200", put2.status === 200);
  ok("编辑后名称/停用/每周三 07:30 生效",
    e2?.name === "验收用任务（改名）" && e2?.enabled === false && e2?.schedule?.kind === "weekly" && e2?.schedule?.weekday === 3,
    JSON.stringify(e2));

  const put3 = await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: originalTasks.map(toInput) }) });
  ok("PUT 删除任务 → 200 且回到 4 个", put3.status === 200 && (put3.data.config?.tasks ?? []).length === 4);

  const bad = [
    ["时间格式 99:99 → 400", { tasks: [{ name: "x", job: "daily_focus", enabled: true, schedule: { kind: "daily", time: "99:99" } }] }],
    ["每周任务缺 weekday → 400", { tasks: [{ name: "x", job: "daily_focus", enabled: true, schedule: { kind: "weekly", time: "09:00" } }] }],
    ["非法 job → 400", { tasks: [{ name: "x", job: "not_a_job", enabled: true, schedule: { kind: "daily", time: "09:00" } }] }],
    ["tasks 非数组 → 400", { tasks: "oops" }],
  ];
  for (const [name, body] of bad) {
    const r = await api("/api/scheduler", { method: "PUT", body: JSON.stringify(body) });
    ok(name, r.status === 400, JSON.stringify(r.data).slice(0, 160));
  }
  const afterBad = await api("/api/scheduler");
  ok("非法 PUT 未破坏原配置", (afterBad.data.config?.tasks ?? []).length === 4);

  // ---------- 自然语言解析：1 次最小真实调用，只预览不落库 ----------
  const emptyParse = await post("/api/scheduler/parse", { text: "" });
  ok("解析空文本 → 400", emptyParse.status === 400);
  const beforeParse = await api("/api/scheduler");
  const msgsBeforeParse = await api("/api/messages");
  const parse = await post("/api/scheduler/parse", { text: "每周五晚上 9 点" });
  if (parse.status === 200) {
    modelVerified = true;
    const p = parse.data.parsed;
    ok("真实模型解析 → 200", true);
    ok("解析出每周任务", p?.schedule?.kind === "weekly", JSON.stringify(p));
    ok("解析出周五（weekday=5）", p?.schedule?.weekday === 5, JSON.stringify(p?.schedule));
    ok("解析出 21:00", p?.schedule?.time === "21:00", JSON.stringify(p?.schedule));
    ok("返回人类可读 label", typeof p?.label === "string" && p.label.includes("周五"), String(p?.label));
  } else {
    skip("真实模型解析链路", `模型不可用（${parse.status} ${String(parse.data?.error ?? "").slice(0, 90)}）；按要求不用 mock 假装通过`);
    ok("模型不可用时明确回报 model_unavailable", parse.status === 502 || parse.status === 429, String(parse.status));
  }
  const afterParse = await api("/api/scheduler");
  ok("解析预览不落库（任务数不变）",
    (afterParse.data.config?.tasks ?? []).length === (beforeParse.data.config?.tasks ?? []).length);
  const msgsAfterParse = await api("/api/messages");
  ok("解析预览不生成站内消息",
    (msgsAfterParse.data.messages ?? []).length === (msgsBeforeParse.data.messages ?? []).length);

  // ---------- 手动立即运行三个任务 ----------
  const cfgNow = await api("/api/scheduler");
  const ids = Object.fromEntries((cfgNow.data.config?.tasks ?? []).map((t) => [t.job, t.id]));
  const runs = {};
  for (const job of ["daily_focus", "inbox_scan", "weekly_digest"]) {
    const r = await post("/api/scheduler/run", { task_id: ids[job] });
    runs[job] = r;
    ok(`立即运行 ${job} → 200`, r.status === 200, JSON.stringify(r.data).slice(0, 200));
  }
  const msgDaily = runs.daily_focus.data.message;
  const msgInbox = runs.inbox_scan.data.message;
  const msgWeekly = runs.weekly_digest.data.message;
  ok("每日重点消息 kind/source/read 正确",
    msgDaily?.kind === "daily_focus" && String(msgDaily?.source).startsWith("manual:") && msgDaily?.read === false,
    JSON.stringify(msgDaily).slice(0, 220));
  ok("每日重点正文含程序填数板块", /待办：|今日日程：|打卡：/.test(msgDaily?.body ?? ""), String(msgDaily?.body).slice(0, 160));
  ok("巡检正文含「绝不自动整理」", (msgInbox?.body ?? "").includes("绝不自动整理"), String(msgInbox?.body).slice(0, 160));
  ok("巡检只读测试库目录", (msgInbox?.body ?? "").includes("我的知识库测试"), String(msgInbox?.body).slice(0, 160));
  ok("每周小结正文含四项统计", /完成待办|打卡记录|本周日程|暂存区整理/.test(msgWeekly?.body ?? ""), String(msgWeekly?.body).slice(0, 160));
  ok("每周小结合并不调模型", (msgWeekly?.body ?? "").includes("不调用模型"));
  ok("三个任务都声明 AI 评述留周报轮次",
    [msgDaily, msgInbox, msgWeekly].every((m) => (m?.body ?? "").includes("AI 评述") || (m?.body ?? "").includes("周报轮次")),
    JSON.stringify([msgDaily?.body, msgInbox?.body, msgWeekly?.body]).slice(0, 260));
  const afterRuns = await api("/api/messages");
  ok("三条消息都已进入站内消息", [msgDaily, msgInbox, msgWeekly].every((m) => (afterRuns.data.messages ?? []).some((x) => x.id === m?.id)));
  ok("未读计数 ≥ 3", (afterRuns.data.unread ?? 0) >= 3, String(afterRuns.data.unread));

  const badRun1 = await post("/api/scheduler/run", { task_id: "不存在的任务" });
  ok("运行不存在任务 → 400", badRun1.status === 400, JSON.stringify(badRun1.data));
  const badRun2 = await post("/api/scheduler/run", {});
  ok("运行缺 task_id → 400", badRun2.status === 400);

  // ---------- 消息已读 / 筛选 / 删除 ----------
  const patch1 = await api("/api/messages", { method: "PATCH", body: JSON.stringify({ id: msgDaily.id, read: true }) });
  ok("PATCH 标记已读 → 200", patch1.status === 200 && patch1.data.message?.read === true, JSON.stringify(patch1.data).slice(0, 160));
  const patch2 = await api("/api/messages", { method: "PATCH", body: JSON.stringify({ id: msgDaily.id, read: false }) });
  ok("PATCH 可标回未读", patch2.status === 200 && patch2.data.message?.read === false);
  const unreadList = await api("/api/messages?filter=unread");
  ok("未读筛选只返回未读", (unreadList.data.messages ?? []).every((m) => m.read === false));
  const patchAll = await api("/api/messages", { method: "PATCH", body: JSON.stringify({ all: true }) });
  ok("PATCH 全部标为已读 → 200", patchAll.status === 200 && patchAll.data.unread === 0, JSON.stringify(patchAll.data).slice(0, 160));
  ok("已读后未读筛选为空", (await api("/api/messages?filter=unread")).data.messages?.length === 0);
  const notFound1 = await api("/api/messages", { method: "PATCH", body: JSON.stringify({ id: "no-such-id" }) });
  ok("PATCH 不存在消息 → 404", notFound1.status === 404);
  const del1 = await api(`/api/messages?id=${encodeURIComponent(msgWeekly.id)}`, { method: "DELETE" });
  ok("DELETE 软删除消息 → 200", del1.status === 200, JSON.stringify(del1.data));
  const listAfterDel = await api("/api/messages");
  ok("删除后列表不再含该消息", !(listAfterDel.data.messages ?? []).some((m) => m.id === msgWeekly.id));
  ok("DELETE 不存在消息 → 404", (await api("/api/messages?id=no-such-id", { method: "DELETE" })).status === 404);
  ok("DELETE 缺 id → 400", (await api("/api/messages", { method: "DELETE" })).status === 400);

  // ---------- 错过不补跑：把结算点拨回 3 天前，时间改到 03:00 避免「刚到点」 ----------
  const quiet = (await api("/api/scheduler")).data.config.tasks.map((t) => ({
    ...toInput(t), schedule: { kind: "daily", time: "03:00" },
  }));
  const quietPut = await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: quiet }) });
  ok("为错过测试临时改到每天 03:00 → 200", quietPut.status === 200);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
  const fakeState = {
    version: 1,
    tasks: Object.fromEntries(quietPut.data.config.tasks.map((t) => [t.id, {
      last_run_at: null, last_settled_at: threeDaysAgo, missed_count: 0,
    }])),
    last_tick_at: null, last_missed_notice_at: null,
  };
  write(STATE_FILE, JSON.stringify(fakeState, null, 2));
  const jobMsgsBefore = (await api("/api/messages")).data.messages.filter((m) => m.kind !== "missed").length;
  const tick = await post("/api/scheduler/tick", {});
  ok("POST /api/scheduler/tick → 200", tick.status === 200, JSON.stringify(tick.data).slice(0, 200));
  ok("tick 不补跑（ran 为空）", (tick.data.result?.ran ?? []).length === 0, JSON.stringify(tick.data.result?.ran));
  const stateAfter = (await api("/api/scheduler")).data.state;
  const totalMissed = Object.values(stateAfter.tasks ?? {}).reduce((n, s) => n + (s.missed_count ?? 0), 0);
  ok("按应跑次数累计错过（3 任务 × 3 天 ≥ 6）", totalMissed >= 6, `total=${totalMissed}`);
  const msgsAfterTick = (await api("/api/messages")).data.messages ?? [];
  const missedMsg = msgsAfterTick.find((m) => m.kind === "missed");
  ok("生成一条错过汇总站内消息", Boolean(missedMsg), JSON.stringify(msgsAfterTick.map((m) => m.kind)));
  ok("汇总正文写明「错过不补跑」", (missedMsg?.body ?? "").includes("错过不补跑"), String(missedMsg?.body).slice(0, 160));
  const jobMsgsAfter = msgsAfterTick.filter((m) => m.kind !== "missed").length;
  ok("不补跑证据：任务类消息数量未增加", jobMsgsAfter === jobMsgsBefore, `${jobMsgsBefore} → ${jobMsgsAfter}`);
  ok("tick 记录 last_tick_at", typeof stateAfter.last_tick_at === "string" && stateAfter.last_tick_at.length > 0);

  // 再 tick 一次：结算点已推进，不应重复累计
  const beforeAgain = Object.values((await api("/api/scheduler")).data.state.tasks ?? {}).reduce((n, s) => n + s.missed_count, 0);
  await post("/api/scheduler/tick", {});
  const afterAgain = Object.values((await api("/api/scheduler")).data.state.tasks ?? {}).reduce((n, s) => n + s.missed_count, 0);
  ok("重复 tick 不重复累计错过次数", afterAgain === beforeAgain, `${beforeAgain} → ${afterAgain}`);

  // ---------- 自动 tick 真的在跑 ----------
  if (WAIT_TICK) {
    const t0 = (await api("/api/scheduler")).data.state.last_tick_at;
    console.log("  …等待 66 秒验证 node-cron 自动 tick（服务进程内，不动系统）");
    await new Promise((r) => setTimeout(r, 66_000));
    const t1 = (await api("/api/scheduler")).data.state.last_tick_at;
    ok("cron 自动 tick 在推进 last_tick_at", typeof t1 === "string" && t1 > t0, `${t0} → ${t1}`);
  } else {
    skip("cron 自动 tick 推进", "WAIT_TICK=0 已跳过等待");
  }

  // ---------- 零接触 / 不写文件 ----------
  const realAfter = snapshot(REAL_POSIX);
  ok("真实知识库零接触（文件 + mtime 快照一致）", realAfter === realBefore, diffSnapshot(realBefore, realAfter));
  const testAfter = snapshot(TEST_POSIX);
  ok("测试知识库未被写入（文件集合一致）", testAfter === testBefore, diffSnapshot(testBefore, testAfter));

  // ---------- 收尾：恢复配置 + 彻底清理本轮消息 ----------
  await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: originalTasks.map(toInput) }) });
  write(CFG_FILE, cfgBackup);
  write(STATE_FILE, stateBackup);
  const dc = db();
  const rows = dc.prepare("SELECT id FROM items WHERE type = 'message'").all();
  const toDelete = rows.filter((r) => !initialIds.includes(r.id)).map((r) => r.id);
  if (toDelete.length) {
    dc.prepare(`DELETE FROM items WHERE id IN (${toDelete.map(() => "?").join(",")})`).run(...toDelete);
  }
  const remain = (dc.prepare("SELECT id FROM items WHERE type = 'message'").all()).length;
  dc.close();
  ok("本轮消息已从主库清理", remain === initialIds.length, `remain=${remain} initial=${initialIds.length}`);
  const final = await api("/api/messages");
  ok("清理后消息接口正常", final.status === 200);

  console.log(`\n结果：${passed} 通过，${failed} 失败，${skipped} 跳过`);
  console.log(`真实模型解析链路：${modelVerified ? "已验证（1 次最小调用）" : "未验证（模型不可用，已如实标注）"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
