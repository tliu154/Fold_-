/**
 * function calling 检索工具端到端验收（一期 A8）
 * 用法：先启动服务，再 node scripts/e2e-index.mjs
 * 覆盖：401 → 索引状态/重建 → 白名单读写 → 排除规则(key 文件、项目自身不进索引) →
 *       元数据字段(不读正文) → search_notes/get_note/stats 三函数 →
 *       普通模式触发工具调用 → 临时模式不挂工具 → 清理恢复白名单
 * ⚠️ 含 1~2 次真实 DeepSeek 调用（少量费用）
 * 注意：测试会临时把白名单改成一个自建的临时目录，测完恢复原白名单。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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
  console.log(`检索工具端到端验收 ${BASE}`);
  ok("未登录 GET /api/index → 401", (await api("/api/index")).status === 401);
  ok("未登录 GET /api/index/search → 401", (await api("/api/index/search?q=x")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 保存原白名单
  const before = await api("/api/index");
  const originalDirs = before.data.dirs ?? [];
  ok("GET /api/index 返回状态", before.status === 200 && typeof before.data.count === "number");

  // 用临时目录做隔离测试
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fold-index-e2e-"));
  const mk = (name, content) => fs.writeFileSync(path.join(tmp, name), content, "utf-8");
  mk("微积分笔记.md", "---\ntitle: 夹逼定理\n---\n# 极限\n正文关键词不应被索引 XYZSECRETWORD");
  mk("YOLO学习.md", "# YOLO\n标签测试");
  mk("api-key.md", "这是密钥文件不该被索引");
  mk("notes.txt", "# 非 md 不该被索引");
  fs.mkdirSync(path.join(tmp, ".obsidian"));
  mk(".obsidian/隐藏.md", "# 隐藏目录不该被索引");

  const set = await api("/api/index", { method: "PUT", body: JSON.stringify({ dirs: [tmp] }) });
  ok("PUT 白名单 → 200 且立即重建", set.status === 200 && set.data.count >= 2, JSON.stringify(set.data).slice(0, 200));

  const status = await api("/api/index");
  ok("索引状态条目数 >= 2", status.data.count >= 2, `count=${status.data.count}`);

  // 排除规则：本实现里空关键词不返回全部（搜索语义），故用关键词/统计逐个验证
  const stAll = await api("/api/index/search?stats=dir");
  const totalIndexed = Object.values(stAll.data.stats ?? {}).reduce((a, b) => a + b, 0);
  ok("只索引了 2 个 md（排除生效）", totalIndexed === 2, JSON.stringify(stAll.data.stats));
  ok("排除 api-key.md（密钥文件）",
    ((await api("/api/index/search?q=api-key")).data.results ?? []).length === 0);
  ok("排除 .obsidian 隐藏目录",
    ((await api("/api/index/search?q=%E9%9A%90%E8%97%8F")).data.results ?? []).length === 0);
  ok("排除 .txt（非 md）",
    ((await api("/api/index/search?q=%E9%9D%9E%20md")).data.results ?? []).length === 0);
  ok("不索引正文关键词 XYZSECRETWORD",
    ((await api("/api/index/search?q=XYZSECRETWORD")).data.results ?? []).length === 0);
  ok("索引了微积分笔记.md",
    ((await api("/api/index/search?q=%E5%BE%AE%E7%A7%AF%E5%88%86")).data.results ?? [])
      .some((r) => r.path.includes("微积分笔记.md")));
  ok("索引了 YOLO学习.md",
    ((await api("/api/index/search?q=YOLO")).data.results ?? [])
      .some((r) => r.path.includes("YOLO学习.md")));

  // 元数据：只存标题/标签，不含正文关键词
  const note = await api(`/api/index/search?get=${encodeURIComponent(path.join(tmp, "微积分笔记.md"))}`);
  ok("get_note 返回元信息", note.status === 200 && note.data.note?.title === "夹逼定理", JSON.stringify(note.data));
  ok("元信息不含正文字段", note.data.note && !("content" in note.data.note) && !("body" in note.data.note));

  // 三个函数（通过 search API 验证本地执行器）
  const kw = await api("/api/index/search?q=微积分&limit=10");
  ok("search_notes 按关键词命中", kw.data.results?.some((r) => r.title.includes("微积分") || r.path.includes("微积分")));
  const byTag = await api("/api/index/search?tag=course%2F%E5%BE%AE%E7%A7%AF%E5%88%86");
  ok("search_notes 按标签过滤（无匹配也不报错）", byTag.status === 200 && Array.isArray(byTag.data.results));
  const st = await api("/api/index/search?stats=dir");
  ok("stats 按目录统计返回对象", st.status === 200 && st.data.stats && typeof st.data.stats === "object" && Object.keys(st.data.stats).length > 0, JSON.stringify(st.data.stats).slice(0, 160));

  // 真实模型调用：普通模式挂工具、临时模式不挂
  const session = await api("/api/chat/sessions", { method: "POST" });
  const sid = session.data.session?.id;
  const normal = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "normal", session_id: sid, message: "用工具查一下我的笔记里有没有关于微积分的记录，只回复结论" }),
  });
  ok("普通模式 → 200", normal.status === 200 && typeof normal.data.reply === "string" && normal.data.reply.length > 0, JSON.stringify(normal.data).slice(0, 200));
  ok("普通模式返回 tools_used 数组", Array.isArray(normal.data.tools_used), JSON.stringify(normal.data.tools_used));
  ok("模型确实调用了检索工具", normal.data.tools_used?.length > 0, JSON.stringify(normal.data.tools_used));
  ok("调用的是三者之一", (normal.data.tools_used ?? []).every((t) => ["search_notes", "get_note", "stats"].includes(t)), JSON.stringify(normal.data.tools_used));

  const temp = await api("/api/chat/send", {
    method: "POST",
    body: JSON.stringify({ mode: "temp", message: "只回复两个字：收到" }),
  });
  ok("临时模式 → 200", temp.status === 200);
  ok("临时模式 tools_used 为空（不挂工具）", Array.isArray(temp.data.tools_used) && temp.data.tools_used.length === 0, JSON.stringify(temp.data.tools_used));

  // 清理
  await api(`/api/chat/sessions/${sid}`, { method: "DELETE" });
  await api("/api/index", { method: "PUT", body: JSON.stringify({ dirs: originalDirs.length ? originalDirs : ["D:\\我的知识库"] }) });
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
