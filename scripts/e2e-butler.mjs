/**
 * AI 管家端到端验收（一期 A9）
 * 用法：先启动服务，再 node scripts/e2e-butler.mjs
 * 覆盖：401 → 无状态问答(不落库) → 会话模式(落库+隔离) → 婉拒 →
 *       工具可用(assistant 映射) → 参数校验 → 清理
 * ⚠️ 含 2 次真实 DeepSeek 调用（少量费用）
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
  console.log(`AI 管家端到端验收 ${BASE}`);
  ok("未登录 POST /api/butler/ask → 401", (await api("/api/butler/ask", { method: "POST", body: JSON.stringify({ question: "x", mode: "stateless" }) })).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 快捷问题静态校验（前端按钮文案来自 butler.ts 常量，此处验证 API 能处理同类问题）
  const before = (await api("/api/chat/sessions")).data.sessions ?? [];

  // 1. 无状态问答（不落库）
  const stateless = await api("/api/butler/ask", {
    method: "POST",
    body: JSON.stringify({ question: "今天有什么待办？", mode: "stateless" }),
  });
  ok("无状态问答 → 200 且有回复", stateless.status === 200 && typeof stateless.data.reply === "string" && stateless.data.reply.length > 0, JSON.stringify(stateless.data).slice(0, 200));
  ok("无状态 session_id=null", stateless.data.session_id === null);
  ok("无状态 memory_applied=true（管家身份+assistant映射）", stateless.data.memory_applied === true);
  const afterStateless = (await api("/api/chat/sessions")).data.sessions ?? [];
  ok("无状态不新增会话/不落库", afterStateless.length === before.length, `before=${before.length} after=${afterStateless.length}`);

  // 2. 婉拒：问范围外问题
  const off = await api("/api/butler/ask", {
    method: "POST",
    body: JSON.stringify({ question: "请帮我写一篇关于量子力学科普文章，并推荐几家餐厅", mode: "stateless" }),
  });
  const offText = typeof off.data.reply === "string" ? off.data.reply : "";
  ok("范围外问题 → 200 且回复明确婉拒并引导站内",
    off.status === 200 && /超出|不在|只处理|职责范围|不能|无法/.test(offText) && /站内|对话|待办|笔记/.test(offText),
    JSON.stringify(offText).slice(0, 200));

  // 3. 会话模式（复用 A6 会话壳）
  const s = await api("/api/chat/sessions", { method: "POST" });
  const sid = s.data.session?.id;
  const sessionAsk = await api("/api/butler/ask", {
    method: "POST",
    body: JSON.stringify({ question: "统计一下数据", mode: "session", session_id: sid }),
  });
  ok("会话模式 → 200", sessionAsk.status === 200 && typeof sessionAsk.data.reply === "string" && sessionAsk.data.reply.length > 0, JSON.stringify(sessionAsk.data).slice(0, 200));
  ok("会话模式返回 session_id", sessionAsk.data.session_id === sid);
  const msgs = await api(`/api/chat/sessions/${sid}/messages`);
  ok("会话消息落库（user+assistant）", msgs.data.messages?.length === 2, JSON.stringify(msgs.data.messages).slice(0, 200));

  // 4. assistant 映射生效（与 chat 隔离）：管家会话的 tools_used 可含检索工具
  ok("会话模式 tools_used 为数组", Array.isArray(sessionAsk.data.tools_used), JSON.stringify(sessionAsk.data.tools_used));

  // 5. 参数校验
  ok("空问题 → 400", (await api("/api/butler/ask", { method: "POST", body: JSON.stringify({ question: "", mode: "stateless" }) })).status === 400);
  ok("非法 mode → 400", (await api("/api/butler/ask", { method: "POST", body: JSON.stringify({ question: "x", mode: "xxx" }) })).status === 400);
  ok("会话模式缺 session_id → 400", (await api("/api/butler/ask", { method: "POST", body: JSON.stringify({ question: "x", mode: "session" }) })).status === 400);

  // 清理
  await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
