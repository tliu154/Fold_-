/**
 * 二期 B2：obsidian:// 跳转 端到端验收
 * 用法：先启动服务，再 node scripts/e2e-obsidian.mjs
 * 覆盖：401 → 配置读写(含兼容旧客户端不传字段) → 库名留空禁用 → 链接格式/编码/
 *       .md 省略扩展名 → 子目录相对路径 → 最长匹配根 → 排除规则 → 越权拦截 →
 *       meta 单文件 → 不写文件 → 恢复配置并清理
 * 注意：只操作 D:\我的知识库测试，不碰真实知识库；不调用模型、无费用。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const TEST = "D:\\我的知识库测试";
const TEST_POSIX = "D:/我的知识库测试";
const VAULT = "我的知识库测试";
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
function parseUri(u) {
  if (typeof u !== "string") return null;
  const [base, qs] = u.split("?");
  const params = new URLSearchParams(qs ?? "");
  return { base, vault: params.get("vault"), file: params.get("file") };
}
function cfgBody(original, overrides = {}) {
  return {
    knowledgeDirs: original.knowledgeDirs,
    projectDirs: original.projectDirs,
    indexDirs: original.indexDirs,
    exportVault: original.exportVault,
    dirMap: original.dirMap,
    obsidianVault: original.obsidianVault ?? "",
    ...overrides,
  };
}
function put(body) {
  return api("/api/libraries", { method: "PUT", body: JSON.stringify(body) });
}
function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...allFiles(p));
    else out.push(p);
  }
  return out;
}

async function main() {
  console.log(`obsidian:// 跳转端到端验收 ${BASE}`);
  ok("未登录 GET /api/libraries → 401", (await api("/api/libraries")).status === 401);
  ok("未登录 GET /api/libraries/files → 401", (await api("/api/libraries/files")).status === 401);
  ok("未登录 PUT /api/libraries → 401", (await put({})).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 原配置（收尾恢复）
  const cfg0 = await api("/api/libraries");
  const original = cfg0.data.config;
  ok("GET 配置 → 200", cfg0.status === 200 && Boolean(original));
  ok("配置含 obsidianVault 字段且默认空串", typeof original.obsidianVault === "string" && original.obsidianVault === "", JSON.stringify(original.obsidianVault));

  // 只在测试库建临时文件
  const dirs = ["笔记", "课件和教材", ".obsidian"];
  for (const d of dirs) fs.mkdirSync(path.join(TEST_POSIX, d), { recursive: true });
  const fixtures = [
    path.join(TEST_POSIX, "笔记", "跳转测试.md"),
    path.join(TEST_POSIX, "笔记", "跳转附件.pdf"),
    path.join(TEST_POSIX, "笔记", "空格 与&符号.md"),
    path.join(TEST_POSIX, "笔记", "api-key.md"),
    path.join(TEST_POSIX, "课件和教材", "讲义笔记.md"),
    path.join(TEST_POSIX, ".obsidian", "hidden.md"),
  ];
  for (const f of fixtures) fs.writeFileSync(f, "# fixture", "utf-8");
  const beforeCount = allFiles(TEST_POSIX).length;
  ok("测试库 fixture 已就绪", beforeCount >= fixtures.length, String(beforeCount));

  // 库名留空 → 链接禁用
  const emptyFiles = await api("/api/libraries/files?limit=500");
  ok("库名留空时 GET files → 200", emptyFiles.status === 200);
  const emptyUris = (emptyFiles.data.files ?? []).filter((f) => f.obsidian_uri != null);
  ok("库名留空 → 所有 obsidian_uri 为 null", emptyUris.length === 0, JSON.stringify(emptyUris.slice(0, 2)));

  // 填写库名
  const setVault = await put(cfgBody(original, { obsidianVault: VAULT }));
  ok("PUT 设置 obsidianVault → 200", setVault.status === 200, JSON.stringify(setVault.data).slice(0, 160));
  const reread = await api("/api/libraries");
  ok("GET 回读库名一致", reread.data.config?.obsidianVault === VAULT, JSON.stringify(reread.data.config?.obsidianVault));

  const files = await api("/api/libraries/files?limit=500");
  ok("GET files → 200", files.status === 200 && Array.isArray(files.data.files));
  const byName = (n) => (files.data.files ?? []).find((f) => f.name === n);
  const md = byName("跳转测试.md");
  const pdf = byName("跳转附件.pdf");
  const nested = byName("讲义笔记.md");
  const space = byName("空格 与&符号.md");

  ok("列表含跳转测试.md", Boolean(md));
  const u = parseUri(md?.obsidian_uri);
  ok("md 文件生成 obsidian://open 链接", u?.base === "obsidian://open", JSON.stringify(md?.obsidian_uri));
  ok("vault 参数中文编码后正确还原", u?.vault === VAULT, JSON.stringify(u));
  ok(".md 省略扩展名，file 为库内相对路径", u?.file === "笔记/跳转测试", JSON.stringify(u?.file));
  const up = parseUri(pdf?.obsidian_uri);
  ok("非 .md 保留完整文件名与扩展名", up?.file === "笔记/跳转附件.pdf", JSON.stringify(pdf?.obsidian_uri));
  const un = parseUri(nested?.obsidian_uri);
  ok("子目录相对路径正确", un?.file === "课件和教材/讲义笔记", JSON.stringify(nested?.obsidian_uri));
  const us = parseUri(space?.obsidian_uri);
  ok("含空格/& 的文件名 URL 编码后可还原", us?.file === "笔记/空格 与&符号", JSON.stringify(space?.obsidian_uri));
  ok("原始链接中空格与 & 已被编码", typeof space?.obsidian_uri === "string" && !space.obsidian_uri.includes(" ") && !space.obsidian_uri.includes("&符号"), JSON.stringify(space?.obsidian_uri));

  const names = (files.data.files ?? []).map((f) => f.name);
  ok("排除 api-key.md（密钥文件无链接）", !names.includes("api-key.md"));
  ok("排除 .obsidian 隐藏目录", !(files.data.files ?? []).some((f) => f.path.replace(/\\/g, "/").includes("/.obsidian/")));
  const allRelative = (files.data.files ?? []).every((f) => {
    const p = parseUri(f.obsidian_uri);
    return p === null || (p.file !== null && !p.file.includes(":") && !p.file.startsWith("/"));
  });
  ok("所有链接的 file 均为库内相对路径（无盘符/绝对路径）", allRelative);

  // 越权：白名单外路径不生成链接、不读取
  const out = await api(`/api/libraries/files/meta?path=${encodeURIComponent("D:/不在白名单/越权.md")}`);
  ok("白名单外路径 meta → 404（越权拦截）", out.status === 404, JSON.stringify(out.data));
  const meta = await api(`/api/libraries/files/meta?path=${encodeURIComponent("D:/我的知识库测试/笔记/跳转测试.md")}`);
  ok("白名单内 meta → 200 且带 obsidian_uri", meta.status === 200 && typeof meta.data.file?.obsidian_uri === "string", JSON.stringify(meta.data).slice(0, 200));
  ok("meta 链接与列表一致", parseUri(meta.data.file?.obsidian_uri)?.file === "笔记/跳转测试");

  // 兼容旧客户端：PUT 不带 obsidianVault 时保留已有库名
  const legacyBody = cfgBody(original);
  delete legacyBody.obsidianVault;
  const legacyPut = await put(legacyBody);
  ok("PUT 不带 obsidianVault → 200", legacyPut.status === 200);
  ok("不传 obsidianVault 时保留已有库名（不误清）", legacyPut.data.config?.obsidianVault === VAULT, JSON.stringify(legacyPut.data.config?.obsidianVault));

  // 多目录配置：取最长匹配根，相对路径随之变化
  const nestedRoot = path.join(TEST_POSIX, "笔记").replace(/\//g, "\\");
  await put(cfgBody(original, { knowledgeDirs: [TEST, nestedRoot], obsidianVault: VAULT }));
  const nestedFiles = await api("/api/libraries/files?limit=500");
  const nestedMd = (nestedFiles.data.files ?? []).find((f) => f.name === "跳转测试.md");
  ok("多目录取最长匹配根：file 变为「跳转测试」", parseUri(nestedMd?.obsidian_uri)?.file === "跳转测试", JSON.stringify(nestedMd?.obsidian_uri));

  // 不写文件：多次 API 调用后测试库文件集合不变
  await api("/api/libraries/files?kind=md");
  await api("/api/libraries/projects");
  await api("/api/libraries/files/meta?path=" + encodeURIComponent("D:/我的知识库测试/笔记/跳转测试.md"));
  const afterCount = allFiles(TEST_POSIX).length;
  ok("浏览/元信息/看板均不新增文件", afterCount === beforeCount, `${beforeCount} → ${afterCount}`);

  // 恢复原配置（含库名、目录），确认链接再次禁用
  await put(cfgBody(original));
  const restored = await api("/api/libraries");
  ok("恢复配置后 obsidianVault 回到原值", restored.data.config?.obsidianVault === (original.obsidianVault ?? ""), JSON.stringify(restored.data.config?.obsidianVault));
  const finalFiles = await api("/api/libraries/files?limit=500");
  ok("恢复后链接全部禁用", (finalFiles.data.files ?? []).every((f) => f.obsidian_uri == null));

  // 清理 fixture（保留测试库目录本身）
  for (const f of fixtures) { try { fs.unlinkSync(f); } catch {} }
  for (const d of ["笔记", "课件和教材", ".obsidian"]) { try { fs.rmdirSync(path.join(TEST_POSIX, d)); } catch {} }
  ok("测试库 fixture 已清理", allFiles(TEST_POSIX).length === 0, String(allFiles(TEST_POSIX).length));

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
