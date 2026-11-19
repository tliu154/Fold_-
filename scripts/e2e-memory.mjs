/**
 * 三层记忆 + 映射表端到端验收（一期 A7）
 * 用法：先启动服务，再 node scripts/e2e-memory.mjs
 * 覆盖：401 → 预设模板懒初始化 → 记忆 CRUD → 标签筛选 → 映射读取/覆盖/恢复 →
 *       preview 组装结果 → 普通模式注入(memory_applied) → 临时模式不注入 → 会话壳隔离
 * ⚠️ 含 1 次真实 DeepSeek 调用（普通模式），少量费用
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

async function main() {
  console.log(`三层记忆端到端验收 ${BASE}`);
  ok("未登录 GET /api/memory → 401", (await api("/api/memory")).status === 401);
  ok("未登录 GET /api/memory/preview → 401", (await api("/api/memory/preview")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 1. 预设模板懒初始化
  const list = await api("/api/memory");
  ok("GET /api/memory → 200", list.status === 200);
  const items = list.data.items ?? [];
  ok("预设模板已初始化（>=5 条）", items.length >= 5, `实际 ${items.length} 条`);
  ok("含基础身份层条目", items.some((i) => i.scope === "profile"));
  ok("含 chat 功能记忆条目", items.some((i) => i.scope === "feature" && i.feature === "chat"));
  ok("条目带 tags", items.every((i) => Array.isArray(i.tags)) && items.some((i) => i.tags.length > 0));

  // 2. 映射表默认值
  ok("返回默认映射与生效映射", Boolean(list.data.mapping && list.data.defaults));
  const chatMap = list.data.mapping?.chat;
  ok("chat 映射：profile=true, features=[chat], context=true",
    chatMap?.profile === true && chatMap?.features?.includes("chat") && chatMap?.context === true, JSON.stringify(chatMap));
  ok("预留功能条目存在（assistant/capture/report）",
    ["assistant", "capture", "report"].every((k) => Boolean(list.data.mapping?.[k])));

  // 3. 记忆 CRUD
  const created = await api("/api/memory", {
    method: "POST",
    body: JSON.stringify({ scope: "fact", title: "e2e 事实条目", content: "这是一条测试事实", tags: ["e2e", "测试"] }),
  });
  ok("新增记忆条目 → 201", created.status === 201, JSON.stringify(created.data));
  const id = created.data.item?.id;
  ok("新增字段回读正确", Boolean(id && created.data.item?.scope === "fact" && created.data.item?.tags?.length === 2));

  const edited = await api(`/api/memory/${id}`, {
    method: "PATCH", body: JSON.stringify({ title: "e2e 事实已改", content: "改过的内容", tags: ["e2e"] }),
  });
  ok("编辑 → 200 字段更新", edited.status === 200 && edited.data.item?.title === "e2e 事实已改" && edited.data.item?.content === "改过的内容" && edited.data.item?.tags?.length === 1);

  // 4. 标签筛选 / scope 筛选
  const byTag = await api("/api/memory?tag=e2e");
  ok("按标签筛选命中", byTag.status === 200 && byTag.data.items?.some((i) => i.id === id));
  const byTags = await api("/api/memory?tags=e2e,测试");
  ok("按多标签筛选命中", byTags.data.items?.some((i) => i.id === id));
  const byScope = await api("/api/memory?scope=fact");
  ok("按 scope 筛选只返回 fact", byScope.data.items?.every((i) => i.scope === "fact"));

  // 5. 映射覆盖 / 恢复
  const put = await api("/api/memory/mapping", {
    method: "PUT",
    body: JSON.stringify({ mapping: { chat: { profile: false, features: [], context: true } } }),
  });
  ok("映射覆盖 → 200 且生效", put.status === 200 && put.data.mapping?.chat?.profile === false && put.data.mapping?.chat?.features?.length === 0, JSON.stringify(put.data.mapping?.chat));
  const previewOff = await api("/api/memory/preview?feature=chat");
  ok("覆盖后 preview 不含基础身份", previewOff.status === 200 && !previewOff.data.system?.includes("基础身份"), JSON.stringify(previewOff.data.system).slice(0, 160));

  const reset = await api("/api/memory/mapping", { method: "DELETE" });
  ok("恢复默认映射 → 200", reset.status === 200 && reset.data.mapping?.chat?.profile === true);
  const previewOn = await api("/api/memory/preview?feature=chat");
  ok("恢复后 preview 含基础身份与 chat 功能记忆",
    previewOn.data.system?.includes("基础身份") && previewOn.data.system?.includes("chat 功能记忆"), JSON.stringify(previewOn.data.system).slice(0, 160));

  // 6. 与 A6 联动（1 次真实模型调用）
  const session = await api("/api/chat/sessions", { method: "POST" });
  const sid = session.data.session?.id;
  const normal = await api("/api/chat/send", {
    method: "POST", body: JSON.stringify({ mode: "normal", session_id: sid, message: "只回复两个字：收到" }),
  });
  ok("普通模式 → 200", normal.status === 200 && typeof normal.data.reply === "string" && normal.data.reply.length > 0, JSON.stringify(normal.data).slice(0, 200));
  ok("普通模式 memory_applied=true", normal.data.memory_applied === true);

  const temp = await api("/api/chat/send", {
    method: "POST", body: JSON.stringify({ mode: "temp", message: "只回复两个字：收到" }),
  });
  ok("临时模式 memory_applied=false", temp.status === 200 && temp.data.memory_applied === false);
  ok("临时模式 session_id=null（仍不落库）", temp.data.session_id === null);

  // 会话壳与记忆 scope 隔离
  const afterList = await api("/api/memory");
  ok("记忆列表不含 chat_session 会话壳", afterList.data.items?.every((i) => i.scope !== "chat_session"));

  // 7. 参数校验
  ok("空标题 → 400", (await api("/api/memory", { method: "POST", body: JSON.stringify({ scope: "fact", title: "", content: "x" }) })).status === 400);
  ok("feature 缺功能名 → 400", (await api("/api/memory", { method: "POST", body: JSON.stringify({ scope: "feature", title: "x", content: "x" }) })).status === 400);
  ok("不存在的条目 → 404", (await api("/api/memory/00000000-0000-4000-8000-000000000000", { method: "DELETE" })).status === 404);

  // 清理：删除 e2e 条目与会话，恢复默认映射
  await api(`/api/memory/${id}`, { method: "DELETE" });
  await api("/api/memory/mapping", { method: "DELETE" });
  await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
