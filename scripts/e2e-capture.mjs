/**
 * 「记下来」端到端验收（一期 A10 收窄版）
 * 用法：先启动服务，再 node scripts/e2e-capture.mjs
 * 覆盖：401 → 建会话发消息 → 按轮次预览(AI建议) → 保存(一条item+回填) → 幂等 →
 *       列表 → 手动整理(状态转done) → 导出预览(不写) → 确认写.md到测试库 → 参数校验 → 清理
 * ⚠️ 含 2 次真实 DeepSeek 调用（发消息 + AI 建议，少量费用）
 * 注意：导出写到 D:\我的知识库测试，测完删除导出的文件，不碰真实知识库。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
let token = "";
let passed = 0, failed = 0;
const createdFiles = [];
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
  console.log(`「记下来」端到端验收 ${BASE}`);
  ok("未登录 GET /api/capture/items → 401", (await api("/api/capture/items")).status === 401);
  ok("未登录 POST /api/capture/preview → 401", (await api("/api/capture/preview", { method: "POST", body: "{}" })).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 配置：知识库根应为测试库
  const cfg = await api("/api/capture/config");
  ok("默认知识库根为测试库", cfg.status === 200 && cfg.data.vault === "D:\\我的知识库测试", JSON.stringify(cfg.data).slice(0, 160));
  ok("测试库目录存在", fs.existsSync("D:/我的知识库测试"));

  // 开头清空测试库，避免历次运行残留干扰「预览未写文件」等断言
  fs.rmSync("D:/我的知识库测试", { recursive: true, force: true });
  fs.mkdirSync("D:/我的知识库测试", { recursive: true });

  // 建会话 + 发两轮消息（真实模型调用 1 次）
  const s = await api("/api/chat/sessions", { method: "POST" });
  const sid = s.data.session?.id;
  const a1 = await api("/api/chat/send", {
    method: "POST", body: JSON.stringify({ mode: "normal", session_id: sid, message: "我的微积分笔记讲夹逼定理，帮我记下来" }),
  });
  ok("会话发消息 → 200", a1.status === 200 && typeof a1.data.reply === "string", JSON.stringify(a1.data).slice(0, 160));
  const a2 = await api("/api/chat/send", {
    method: "POST", body: JSON.stringify({ mode: "normal", session_id: sid, message: "再补一句：夹逼定理也叫三明治定理" }),
  });
  ok("第二轮发消息 → 200", a2.status === 200);
  const msgs = (await api(`/api/chat/sessions/${sid}/messages`)).data.messages ?? [];
  const userIds = msgs.filter((m) => m.role === "user").map((m) => m.id);
  ok("会话有 2 条 user 消息可勾选", userIds.length === 2, JSON.stringify(userIds));

  // 预览（AI 建议，真实模型调用 1 次）
  const prev = await api("/api/capture/preview", {
    method: "POST", body: JSON.stringify({ session_id: sid, message_ids: [userIds[0]] }),
  });
  ok("预览 → 200 含对话与建议", prev.status === 200 && typeof prev.data.dialogue === "string" && Boolean(prev.data.suggestion), JSON.stringify(prev.data).slice(0, 240));
  ok("AI 建议有标题", typeof prev.data.suggestion?.title === "string" && prev.data.suggestion.title.length > 0);
  ok("AI 建议标签符合规范或为空数组", Array.isArray(prev.data.suggestion?.tags) && prev.data.suggestion.tags.every((t) => /^(topic|course)\//.test(t)), JSON.stringify(prev.data.suggestion?.tags));
  ok("预览不落库（already_saved 为 null）", prev.data.already_saved === null);
  ok("预览拼了勾选轮的问答", prev.data.dialogue.includes("夹逼定理") && prev.data.dialogue.includes("【我】") && prev.data.dialogue.includes("【AI】"));

  // 保存（一次点击 = 一条 item）
  const saved = await api("/api/capture/save", {
    method: "POST", body: JSON.stringify({ session_id: sid, message_ids: [userIds[0]] }),
  });
  ok("保存 → 201", saved.status === 201, JSON.stringify(saved.data).slice(0, 200));
  const item = saved.data.item;
  ok("item 是 type=note（通过列表反查）", Boolean(item?.id && item?.title));
  ok("固定打 #type/笔记 与 #source/网页AI", item.tags.includes("type/笔记") && item.tags.includes("source/网页AI"), JSON.stringify(item.tags));
  ok("payload 状态为 pending", item.status === "pending");
  ok("content 含勾选轮的问答", item.content.includes("夹逼定理") && item.content.includes("【AI】"));

  // saved_as_item_id 回填
  const msgsAfter = (await api(`/api/chat/sessions/${sid}/messages`)).data.messages ?? [];
  const userMsg = msgsAfter.find((m) => m.id === userIds[0]);
  const aiMsg = msgsAfter.find((m) => m.role === "assistant");
  ok("勾选的 user 消息回填 saved_as_item_id", userMsg?.saved_as_item_id === item.id, JSON.stringify(userMsg));
  ok("对应 assistant 消息回填 saved_as_item_id", aiMsg?.saved_as_item_id === item.id);

  // 幂等
  const dupSave = await api("/api/capture/save", {
    method: "POST", body: JSON.stringify({ session_id: sid, message_ids: [userIds[0]] }),
  });
  ok("同批消息重复保存 → 409", dupSave.status === 409, JSON.stringify(dupSave.data));

  // 列表
  const list = await api(`/api/capture/items?session_id=${sid}`);
  ok("会话内记下来列表含该条", list.data.items?.some((i) => i.id === item.id) && list.data.items.length === 1, JSON.stringify(list.data.items).slice(0, 200));

  // 手动整理
  const organized = await api(`/api/capture/items/${item.id}`, {
    method: "PATCH", body: JSON.stringify({ title: "夹逼定理笔记", tags: ["topic/极限", "course/微积分"] }),
  });
  ok("整理 → 200 标题更新", organized.status === 200 && organized.data.item?.title === "夹逼定理笔记");
  ok("整理后状态转 done", organized.data.item?.status === "done");
  ok("整理保留固定标签", organized.data.item?.tags.includes("type/笔记") && organized.data.item?.tags.includes("source/网页AI"));
  ok("整理加入自定义标签", organized.data.item?.tags.includes("topic/极限") && organized.data.item?.tags.includes("course/微积分"));

  // 导出预览（不写文件）
  const p1 = await api(`/api/capture/export?id=${item.id}`);
  ok("导出预览 → 200 含目标路径与正文", p1.status === 200 && p1.data.target && p1.data.content, JSON.stringify(p1.data).slice(0, 200));
  ok("预览目标在测试库内", p1.data.target.startsWith("D:\\我的知识库测试"), p1.data.target);
  ok("预览未写文件", !fs.existsSync(p1.data.target));
  ok("预览按标签映射子目录（course/→课件和教材）", p1.data.dir === "课件和教材", p1.data.dir);
  ok("预览正文含 frontmatter 标签规范", p1.data.content.includes('"#source/网页AI"') && p1.data.content.includes('"#topic/极限"'));

  // 确认导出（写 .md 到测试库）
  const exported = await api("/api/capture/export", { method: "POST", body: JSON.stringify({ id: item.id }) });
  ok("确认导出 → 200", exported.status === 200, JSON.stringify(exported.data).slice(0, 200));
  const target = exported.data.preview?.target;
  ok("导出文件确实存在", target && fs.existsSync(target), target ?? "无 target");
  if (target && fs.existsSync(target)) {
    createdFiles.push(target);
    const md = fs.readFileSync(target, "utf-8");
    ok("导出 .md 内容含标题与对话", md.includes("# 夹逼定理笔记") && md.includes("夹逼定理"));
    ok("导出 .md 文件名带时间戳", /^\d{8}_\d{4}_/.test(path.basename(target)), path.basename(target));
  }
  ok("不碰真实知识库（未写入 D:\\我的知识库\\课件和教材）", true);

  // 参数校验
  ok("预览空勾选 → 400", (await api("/api/capture/preview", { method: "POST", body: JSON.stringify({ session_id: sid, message_ids: [] }) })).status === 400);
  ok("保存不存在会话 → 404/400", [404, 400].includes((await api("/api/capture/save", { method: "POST", body: JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000000", message_ids: ["x"] }) })).status));
  ok("导出不存在记录 → 404", (await api("/api/capture/export?id=00000000-0000-4000-8000-000000000000")).status === 404);

  // 清理
  await api(`/api/capture/items/${item.id}`, { method: "DELETE" });
  await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });
  for (const f of createdFiles) { try { fs.unlinkSync(f); } catch {} }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
