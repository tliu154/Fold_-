/**
 * 首页改版链路自测（curl 层）
 * 用法：先启动服务，再 node scripts/e2e-home.mjs
 * 模拟首页各分区弹框会发出的请求序列：
 *   聚合加载(并行 5 个 API) → 各分区 新增 → 列表出现 → 编辑 → 删除 → 列表消失
 * 说明：浏览器里「点 + 号 / 点条目 / 点删除」的点击行为无法用脚本覆盖，需手动验证；
 *       本脚本保证这些点击背后调用的 API 链路全部可用。
 * 不涉及 AI 对话，不产生模型费用。
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
let token = "";
let passed = 0, failed = 0;
function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
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
function today() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  console.log(`首页链路自测 ${BASE}`);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录", login.status === 200 && token.length > 0);

  // 首页聚合加载（HomeDashboard 的 Promise.all）
  const agg = await Promise.all([
    api("/api/todos?filter=all"), api("/api/events"), api("/api/habits"),
    api("/api/checkins?limit=50"), api("/api/goals"),
  ]);
  ok("首页并行加载 5 个 API 全部 200", agg.every((r) => r.status === 200));
  ok("5 个 API 都返回数组", agg[0].data.todos && agg[1].data.events && agg[2].data.habits && agg[3].data.checkins && agg[4].data.goals);

  // 待办
  const t = await api("/api/todos", { method: "POST", body: JSON.stringify({ title: "e2e 首页待办", content: "备注", due_at: today(), tags: ["首页"] }) });
  ok("待办 新增 → 201", t.status === 201);
  const tid = t.data.todo?.id;
  ok("待办 列表出现", (await api("/api/todos")).data.todos?.some((x) => x.id === tid));
  const tp = await api(`/api/todos/${tid}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 首页待办改" }) });
  ok("待办 编辑 → 200", tp.status === 200 && tp.data.todo?.title === "e2e 首页待办改");
  ok("待办 删除 → 200", (await api(`/api/todos/${tid}`, { method: "DELETE" })).data.ok === true);
  ok("待办 列表消失", !(await api("/api/todos")).data.todos?.some((x) => x.id === tid));

  // 日程
  const e = await api("/api/events", { method: "POST", body: JSON.stringify({ title: "e2e 首页日程", date: today(), start: "10:00", end: "11:00", location: "图书馆", content: "", tags: [] }) });
  ok("日程 新增 → 201", e.status === 201, JSON.stringify(e.data));
  const eid = e.data.event?.id;
  ok("日程 列表出现", (await api("/api/events")).data.events?.some((x) => x.id === eid));
  const ep = await api(`/api/events/${eid}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 首页日程改", location: "教室" }) });
  ok("日程 编辑 → 200", ep.status === 200 && ep.data.event?.title === "e2e 首页日程改" && ep.data.event?.location === "教室");
  ok("日程 删除 → 200", (await api(`/api/events/${eid}`, { method: "DELETE" })).data.ok === true);

  // 习惯
  const h = await api("/api/habits", { method: "POST", body: JSON.stringify({ title: "e2e 首页习惯", tags: ["首页"] }) });
  ok("习惯 新增 → 201", h.status === 201);
  const hid = h.data.habit?.id;
  ok("习惯 列表出现", (await api("/api/habits")).data.habits?.some((x) => x.id === hid));
  const hp = await api(`/api/habits/${hid}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 首页习惯改" }) });
  ok("习惯 编辑 → 200", hp.status === 200 && hp.data.habit?.title === "e2e 首页习惯改");
  ok("习惯 删除 → 200", (await api(`/api/habits/${hid}`, { method: "DELETE" })).data.ok === true);

  // 随手记（首页改版新增 PATCH）
  const n = await api("/api/checkins", { method: "POST", body: JSON.stringify({ title: "e2e 首页随手记", date: today(), habit_id: null }) });
  ok("随手记 新增 → 201", n.status === 201);
  const nid = n.data.checkin?.id;
  ok("随手记 列表出现", (await api("/api/checkins")).data.checkins?.some((x) => x.id === nid && x.habit_id === null));
  const np = await api(`/api/checkins/${nid}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 首页随手记改", note: "补充" }) });
  ok("随手记 编辑 → 200", np.status === 200 && np.data.checkin?.title === "e2e 首页随手记改" && np.data.checkin?.note === "补充", JSON.stringify(np.data));
  ok("随手记 删除 → 200", (await api(`/api/checkins/${nid}`, { method: "DELETE" })).data.ok === true);

  // 长期目标
  const g = await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "e2e 首页目标", description: "描述", target_date: today(), status: "active", progress: 20 }) });
  ok("长期目标 新增 → 201", g.status === 201);
  const gid = g.data.goal?.id;
  ok("长期目标 列表出现", (await api("/api/goals")).data.goals?.some((x) => x.id === gid));
  const gp = await api(`/api/goals/${gid}`, { method: "PATCH", body: JSON.stringify({ title: "e2e 首页目标改", progress: 60 }) });
  ok("长期目标 编辑 → 200", gp.status === 200 && gp.data.goal?.title === "e2e 首页目标改" && gp.data.goal?.progress === 60);
  ok("长期目标 删除 → 200", (await api(`/api/goals/${gid}`, { method: "DELETE" })).data.ok === true);

  // 首页页面本身
  const page = await fetch(`${BASE}/`);
  ok("首页 HTML 返回 200", page.status === 200);

  // 兜底清理（软删除的记录直接删库由外部统一处理）
  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
