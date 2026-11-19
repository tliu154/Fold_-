/**
 * 待办端到端验收（一期 A2）
 * 用法：先启动服务（npm run start），再 node scripts/e2e-todos.mjs
 * 可选环境变量：BASE、PASSWORD
 * 覆盖：未登录401 → 登录 → 新增 → 字段回读 → 勾选完成 → 筛选 → 编辑 →
 *       软删除隐藏 → 回收站可见 → 恢复 → 恢复后可见 → 参数校验
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";

let token = "";
let passed = 0;
let failed = 0;
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

async function main() {
  console.log(`待办端到端验收 ${BASE}`);

  const unauth = await api("/api/todos");
  ok("未登录 GET /api/todos → 401", unauth.status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const ld = await login.json();
  token = ld.token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  const created = await api("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title: "e2e 待办测试", content: "备注内容", due_at: "2026-11-30", tags: ["测试", "e2e"] }),
  });
  ok("新增待办 → 201", created.status === 201, JSON.stringify(created.data));
  const id = created.data.todo?.id;
  ok("新增返回字段完整", Boolean(id && created.data.todo.content === "备注内容" && created.data.todo.due_at === "2026-11-30" && created.data.todo.tags?.length === 2), JSON.stringify(created.data.todo));

  const listed = await api("/api/todos");
  ok("列表含新待办", listed.status === 200 && listed.data.todos?.some((t) => t.id === id));

  const done = await api(`/api/todos/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  ok("勾选完成 → 200", done.status === 200 && done.data.todo?.status === "done");

  const doneList = await api("/api/todos?filter=done");
  ok("筛选已完成含该条", doneList.data.todos?.some((t) => t.id === id));
  const activeList = await api("/api/todos?filter=active");
  ok("筛选待办不含该条", !activeList.data.todos?.some((t) => t.id === id));

  const edited = await api(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "e2e 待办已编辑", content: "新备注" }),
  });
  ok("编辑 → 200 且字段更新", edited.status === 200 && edited.data.todo?.title === "e2e 待办已编辑" && edited.data.todo?.content === "新备注");

  const del = await api(`/api/todos/${id}`, { method: "DELETE" });
  ok("软删除 → 200", del.status === 200 && del.data.ok === true);

  const afterDel = await api("/api/todos");
  ok("删除后正常列表不含该条", !afterDel.data.todos?.some((t) => t.id === id));

  const trash = await api("/api/todos?onlyDeleted=1");
  ok("回收站含该条", trash.status === 200 && trash.data.todos?.some((t) => t.id === id));

  const restored = await api(`/api/todos/${id}/restore`, { method: "POST" });
  ok("恢复 → 200", restored.status === 200 && restored.data.ok === true);

  const afterRestore = await api("/api/todos");
  ok("恢复后列表重现该条", afterRestore.data.todos?.some((t) => t.id === id && t.title === "e2e 待办已编辑"));

  const bad = await api("/api/todos", { method: "POST", body: JSON.stringify({ title: "" }) });
  ok("空标题 → 400", bad.status === 400, JSON.stringify(bad.data));

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
