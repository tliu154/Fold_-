/**
 * 长期目标端到端验收（一期 A5）
 * 用法：先启动服务，再 node scripts/e2e-goals.mjs
 * 覆盖：401 → 新增(五项) → 字段回读 → 配置文件落盘 → 编辑 → 列表 → 删除 →
 *       参数校验(空标题/进度越界/非法日期/非法状态) → 清理
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOALS_FILE = path.join(ROOT, "data", "goals.json");

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

async function main() {
  console.log(`长期目标端到端验收 ${BASE}`);
  ok("未登录 GET /api/goals → 401", (await api("/api/goals")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({
      title: "e2e 长期目标测试", description: "目标描述",
      target_date: "2027-06-30", status: "active", progress: 35,
    }),
  });
  ok("新增目标 → 201", created.status === 201, JSON.stringify(created.data));
  const g = created.data.goal;
  const id = g?.id;
  ok("五项字段回读正确", Boolean(id && g.title === "e2e 长期目标测试" && g.description === "目标描述" && g.target_date === "2027-06-30" && g.status === "active" && g.progress === 35), JSON.stringify(g));

  ok("配置文件已落盘 data/goals.json", fs.existsSync(GOALS_FILE));
  if (fs.existsSync(GOALS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(GOALS_FILE, "utf-8"));
    ok("配置结构 version=1 且含该目标", raw.version === 1 && Array.isArray(raw.goals) && raw.goals.some((x) => x.id === id));
  }

  const edited = await api(`/api/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "e2e 目标已编辑", progress: 80, status: "done" }),
  });
  ok("编辑 → 200 字段更新", edited.status === 200 && edited.data.goal?.title === "e2e 目标已编辑" && edited.data.goal?.progress === 80 && edited.data.goal?.status === "done");

  const listed = await api("/api/goals");
  ok("列表含该目标且反映编辑", listed.status === 200 && listed.data.goals?.some((x) => x.id === id && x.progress === 80));

  ok("空标题 → 400", (await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "" }) })).status === 400);
  ok("进度越界 → 400", (await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "x", progress: 120 }) })).status === 400);
  ok("非法日期 → 400", (await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "x", target_date: "2027/06/30" }) })).status === 400);
  ok("非法状态 → 400", (await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "x", status: "unknown" }) })).status === 400);

  ok("删除 → 200", (await api(`/api/goals/${id}`, { method: "DELETE" })).data.ok === true);
  const after = await api("/api/goals");
  ok("删除后列表不含该目标", !after.data.goals?.some((x) => x.id === id));
  if (fs.existsSync(GOALS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(GOALS_FILE, "utf-8"));
    ok("配置文件同步移除该目标", !raw.goals.some((x) => x.id === id));
  }
  ok("删除不存在 → 404", (await api(`/api/goals/${id}`, { method: "DELETE" })).status === 404);

  // 清理：删除所有 e2e 前缀目标，保证配置干净
  const all = (await api("/api/goals")).data.goals ?? [];
  for (const x of all.filter((v) => v.title.startsWith("e2e ") || v.title === "x")) {
    await api(`/api/goals/${x.id}`, { method: "DELETE" });
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
