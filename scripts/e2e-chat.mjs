/**
 * AI 对话端到端验收（一期 A6）
 * 用法：先启动服务，再 node scripts/e2e-chat.mjs
 * ⚠️ 会真实调用 DeepSeek（约 3 次，产生少量费用）
 * 覆盖：401 → 新建会话 → 临时模式不落库 → 普通模式落库 + 标题派生 →
 *       上下文最近10轮截断 → 会话隔离 → 重命名 → 清空 → 删除 → 参数校验
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
  console.log(`AI 对话端到端验收 ${BASE}`);
  ok("未登录 GET /api/chat/sessions → 401", (await api("/api/chat/sessions")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 1. 临时模式：不落库
  const before = await api("/api/chat/sessions");
  const temp = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "temp", message: "只回复两个字：收到" }),
  });
  ok("临时模式 → 200 且有回复", temp.status === 200 && typeof temp.data.reply === "string" && temp.data.reply.length > 0, JSON.stringify(temp.data).slice(0, 200));
  ok("临时模式 session_id=null", temp.data.session_id === null);
  const afterTemp = await api("/api/chat/sessions");
  ok("临时模式不新增会话/不落库", afterTemp.data.sessions?.length === before.data.sessions?.length);

  // 2. 新建会话 + 普通模式落库
  const created = await api("/api/chat/sessions", { method: "POST" });
  ok("新建会话 → 201", created.status === 201, JSON.stringify(created.data));
  const sid = created.data.session?.id;
  const normal = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "normal", session_id: sid, message: "只回复两个字：你好" }),
  });
  ok("普通模式 → 200 且有回复", normal.status === 200 && typeof normal.data.reply === "string" && normal.data.reply.length > 0, JSON.stringify(normal.data).slice(0, 200));
  ok("普通模式返回 session_id", normal.data.session_id === sid);

  const msgs = await api(`/api/chat/sessions/${sid}/messages`);
  ok("消息已落库（user + assistant）", msgs.status === 200 && msgs.data.messages?.length === 2 && msgs.data.messages?.[0]?.role === "user" && msgs.data.messages?.[1]?.role === "assistant", JSON.stringify(msgs.data.messages).slice(0, 200));

  const list = await api("/api/chat/sessions");
  const session = list.data.sessions?.find((s) => s.id === sid);
  ok("会话标题由首条消息派生", Boolean(session?.title?.startsWith("只回复两个字")), JSON.stringify(session));
  ok("会话 message_count=2", session?.message_count === 2);

  // 3. 上下文：连发第 2 轮验证上下文确实带上历史（context_messages 增长）
  // 注：10 轮上限（slice(-20)）由 src/lib/chat.ts 的 buildContext 保证，
  //     此处只发 2 轮，未触发截断；避免为测上限产生 10+ 次真实模型调用。
  const n2 = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "normal", session_id: sid, message: "再回复两个字：好的" }),
  });
  ok("第二次普通模式 → 200", n2.status === 200 && typeof n2.data.reply === "string");
  ok("上下文带上历史（context_messages 递增）", n2.data.context_messages > normal.data.context_messages, JSON.stringify(n2.data.context_messages));

  // 4. 会话隔离
  const s2 = await api("/api/chat/sessions", { method: "POST" });
  const sid2 = s2.data.session?.id;
  const n3 = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "normal", session_id: sid2, message: "回复一个字：嗯" }),
  });
  ok("第二会话发送 → 200", n3.status === 200);
  const msgs2 = await api(`/api/chat/sessions/${sid2}/messages`);
  ok("会话隔离：第二会话只有自己的消息", msgs2.data.messages?.length === 2 && msgs2.data.messages?.[0]?.content === "回复一个字：嗯", JSON.stringify(msgs2.data.messages).slice(0, 200));

  // 5. 重命名 / 清空 / 删除
  const renamed = await api(`/api/chat/sessions/${sid}`, {
    method: "PATCH", body: JSON.stringify({ title: "e2e 重命名会话" }),
  });
  ok("重命名 → 200", renamed.status === 200 && renamed.data.session?.title === "e2e 重命名会话");

  const cleared = await api(`/api/chat/sessions/${sid}/clear`, { method: "POST" });
  ok("清空 → 200", cleared.status === 200 && cleared.data.ok === true);
  const afterClear = await api(`/api/chat/sessions/${sid}/messages`);
  ok("清空后消息为 0", afterClear.data.messages?.length === 0);
  const stillThere = await api("/api/chat/sessions");
  ok("清空后会话壳仍在", stillThere.data.sessions?.some((s) => s.id === sid && s.title === "e2e 重命名会话"));

  const del = await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });
  ok("删除会话 → 200", del.status === 200 && del.data.ok === true);
  const afterDel = await api("/api/chat/sessions");
  ok("删除后会话列表中消失", !afterDel.data.sessions?.some((s) => s.id === sid));

  // 6. 参数校验
  ok("normal 缺 session_id → 400", (await api("/api/chat/send", { method: "POST", body: JSON.stringify({ mode: "normal", message: "x" }) })).status === 400);
  ok("空消息 → 400", (await api("/api/chat/send", { method: "POST", body: JSON.stringify({ mode: "temp", message: "" }) })).status === 400);
  ok("非法 mode → 400", (await api("/api/chat/send", { method: "POST", body: JSON.stringify({ mode: "xxx", message: "x" }) })).status === 400);
  ok("不存在的会话 → 404", (await api(`/api/chat/sessions/00000000-0000-4000-8000-000000000000/messages`)).status === 404);

  // 清理：删除所有 e2e 会话
  const all = (await api("/api/chat/sessions")).data.sessions ?? [];
  for (const s of all) {
    if (s.title.startsWith("只回复") || s.title.startsWith("回复一个字") || s.title.startsWith("e2e ") || s.title === "新对话") {
      await api(`/api/chat/sessions/${s.id}`, { method: "DELETE" });
    }
  }
  // 兜底：删掉本轮新建的两个会话（若标题不匹配）
  await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });
  await api(`/api/chat/sessions/${sid2}`, { method: "DELETE" });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
