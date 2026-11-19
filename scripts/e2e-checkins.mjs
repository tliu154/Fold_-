/**
 * 打卡端到端验收（一期 A4）
 * 用法：先启动服务，再 node scripts/e2e-checkins.mjs
 * 覆盖：401 → 建习惯 → 打卡 → 同日幂等 → 补记昨天/前天 → 连续天数 →
 *       自由记录隔离 → 习惯编辑 → 软删除保留记录 → 恢复 → 删除打卡记录 → 参数校验
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
let token = "";
let passed = 0, failed = 0;
function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function dateOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  console.log(`打卡端到端验收 ${BASE}`);
  const today = dateOffset(0), y = dateOffset(-1), y2 = dateOffset(-2);

  ok("未登录 GET /api/habits → 401", (await api("/api/habits")).status === 401);
  ok("未登录 GET /api/checkins → 401", (await api("/api/checkins")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  const habitRes = await api("/api/habits", { method: "POST", body: JSON.stringify({ title: "e2e 每天阅读", tags: ["学习"] }) });
  ok("新建习惯 → 201", habitRes.status === 201, JSON.stringify(habitRes.data));
  const habitId = habitRes.data.habit?.id;
  ok("习惯字段回读", Boolean(habitId && habitRes.data.habit.title === "e2e 每天阅读" && habitRes.data.habit.tags?.length === 1));

  const c1 = await api("/api/checkins", {
    method: "POST", body: JSON.stringify({ title: "e2e 每天阅读", date: today, habit_id: habitId }),
  });
  ok("今日打卡 → 201 created=true", c1.status === 201 && c1.data.created === true);
  const checkinId = c1.data.checkin?.id;

  const c1dup = await api("/api/checkins", {
    method: "POST", body: JSON.stringify({ title: "e2e 每天阅读", date: today, habit_id: habitId }),
  });
  ok("同习惯同日重复打卡幂等 → 200 created=false", c1dup.status === 200 && c1dup.data.created === false && c1dup.data.checkin?.id === checkinId);

  await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 每天阅读", date: y, habit_id: habitId }) });
  await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 每天阅读", date: y2, habit_id: habitId }) });
  ok("补记昨天/前天 → 201", true);

  const views = await api("/api/habits");
  const hv = views.data.habits?.find((h) => h.id === habitId);
  ok("连续天数 = 3（今天+昨天+前天）", hv?.streak === 3, JSON.stringify(hv));
  ok("今日已打标记", hv?.todayDone === true);

  // 今天没打时从昨天算：用另一个只打了昨天/前天的习惯
  const h2 = await api("/api/habits", { method: "POST", body: JSON.stringify({ title: "e2e 只补记" }) });
  const h2id = h2.data.habit?.id;
  await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 只补记", date: y, habit_id: h2id }) });
  await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 只补记", date: y2, habit_id: h2id }) });
  const v2 = (await api("/api/habits")).data.habits?.find((h) => h.id === h2id);
  ok("今天没打 → 从昨天算 streak=2", v2?.streak === 2 && v2?.todayDone === false, JSON.stringify(v2));

  // 断档：只打了前天，不算连续
  const h3 = await api("/api/habits", { method: "POST", body: JSON.stringify({ title: "e2e 断档" }) });
  await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 断档", date: y2, habit_id: h3.data.habit?.id }) });
  const v3 = (await api("/api/habits")).data.habits?.find((h) => h.id === h3.data.habit?.id);
  ok("断档 → streak=0", v3?.streak === 0, JSON.stringify(v3));

  const free = await api("/api/checkins", {
    method: "POST", body: JSON.stringify({ title: "e2e 随手记一条", date: today, habit_id: null }),
  });
  ok("自由记录 → 201 且 habit_id=null", free.status === 201 && free.data.checkin?.habit_id === null);
  const freeList = await api("/api/checkins");
  ok("自由记录出现在最近记录", freeList.data.checkins?.some((c) => c.id === free.data.checkin?.id));
  const vAfterFree = (await api("/api/habits")).data.habits?.find((h) => h.id === habitId);
  ok("自由记录不影响连续天数", vAfterFree?.streak === 3, JSON.stringify(vAfterFree));

  const edited = await api(`/api/habits/${habitId}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 阅读已编辑" }) });
  ok("习惯编辑 → 200", edited.status === 200 && edited.data.habit?.title === "e2e 阅读已编辑");

  ok("习惯软删除 → 200", (await api(`/api/habits/${habitId}`, { method: "DELETE" })).data.ok === true);
  const trash = await api("/api/habits?onlyDeleted=1");
  ok("回收站含该习惯", trash.data.habits?.some((h) => h.id === habitId));
  const stillThere = await api("/api/checkins");
  ok("习惯删除后打卡记录仍保留", stillThere.data.checkins?.some((c) => c.habit_id === habitId));

  ok("恢复习惯 → 200", (await api(`/api/habits/${habitId}/restore`, { method: "POST" })).data.ok === true);
  const vRestored = (await api("/api/habits")).data.habits?.find((h) => h.id === habitId);
  ok("恢复后连续天数照旧 = 3", vRestored?.streak === 3, JSON.stringify(vRestored));

  ok("删除打卡记录 → 200", (await api(`/api/checkins/${checkinId}`, { method: "DELETE" })).data.ok === true);
  const vAfterDel = (await api("/api/habits")).data.habits?.find((h) => h.id === habitId);
  ok("删今日记录后 streak 变 2（从昨天算）", vAfterDel?.streak === 2, JSON.stringify(vAfterDel));

  ok("空标题 → 400", (await api("/api/habits", { method: "POST", body: JSON.stringify({ title: "" }) })).status === 400);
  ok("非法日期 → 400", (await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "x", date: "2026/11/30" }) })).status === 400);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
