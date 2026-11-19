/**
 * 日程端到端验收（一期 A3）
 * 用法：先启动服务，再 node scripts/e2e-events.mjs
 * 覆盖：未登录401 → 登录 → 新增(六字段) → 字段回读 → 按日期排序 → 编辑 →
 *       软删除 → 正常列表隐藏 → 回收站 → 恢复 → 参数校验(日期/时间格式)
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
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  console.log(`日程端到端验收 ${BASE}`);

  ok("未登录 GET /api/events → 401", (await api("/api/events")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  const d1 = dateOffset(0);
  const d2 = dateOffset(9);
  const created = await api("/api/events", {
    method: "POST",
    body: JSON.stringify({
      title: "e2e 日程测试", date: d2, start: "14:30", end: "15:30",
      location: "会议室", content: "讨论事项", tags: ["会议", "e2e"],
    }),
  });
  ok("新增日程 → 201", created.status === 201, JSON.stringify(created.data));
  const ev = created.data.event;
  const id = ev?.id;
  ok("六字段回读正确", Boolean(id && ev.date === d2 && ev.start === "14:30" && ev.end === "15:30" && ev.location === "会议室" && ev.content === "讨论事项" && ev.tags?.length === 2), JSON.stringify(ev));

  const created2 = await api("/api/events", {
    method: "POST",
    body: JSON.stringify({ title: "e2e 今天日程", date: d1, start: "09:00" }),
  });
  ok("新增今天日程 → 201", created2.status === 201);
  const id2 = created2.data.event?.id;

  const listed = await api("/api/events");
  ok("列表含两条", listed.status === 200 && listed.data.events?.some((e) => e.id === id) && listed.data.events?.some((e) => e.id === id2));
  const beforeDates = listed.data.events.map((e) => e.date);
  const sortedDates = [...beforeDates].sort();
  ok("列表按日期升序", JSON.stringify(beforeDates) === JSON.stringify(sortedDates), JSON.stringify(beforeDates));

  const edited = await api(`/api/events/${id}`, {
    method: "PATCH", body: JSON.stringify({ title: "e2e 日程已编辑", end: "16:00" }),
  });
  ok("编辑 → 200 字段更新", edited.status === 200 && edited.data.event?.title === "e2e 日程已编辑" && edited.data.event?.end === "16:00");

  ok("软删除 → 200", (await api(`/api/events/${id}`, { method: "DELETE" })).data.ok === true);
  const afterDel = await api("/api/events");
  ok("删除后正常列表不含", !afterDel.data.events?.some((e) => e.id === id));
  const trash = await api("/api/events?onlyDeleted=1");
  ok("回收站含该条", trash.data.events?.some((e) => e.id === id));
  ok("恢复 → 200", (await api(`/api/events/${id}/restore`, { method: "POST" })).data.ok === true);
  const afterRestore = await api("/api/events");
  ok("恢复后重现", afterRestore.data.events?.some((e) => e.id === id && e.title === "e2e 日程已编辑"));

  const badDate = await api("/api/events", { method: "POST", body: JSON.stringify({ title: "x", date: "2026/11/30" }) });
  ok("非法日期 → 400", badDate.status === 400, JSON.stringify(badDate.data));
  const badTime = await api("/api/events", { method: "POST", body: JSON.stringify({ title: "x", date: d1, start: "25:00" }) });
  ok("非法时间 → 400", badTime.status === 400, JSON.stringify(badTime.data));

  // 清理测试条目（通过 API 软删除即可，测试库保持干净）
  await api(`/api/events/${id}`, { method: "DELETE" });
  await api(`/api/events/${id2}`, { method: "DELETE" });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
