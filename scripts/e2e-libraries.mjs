/**
 * 二期 B1：知识库/项目库 文件浏览 + 进度看板 端到端验收
 * 用法：先启动服务，再 node scripts/e2e-libraries.mjs
 * 覆盖：401 → 统一配置(默认测试库) → 多目录配置与旧配置同步 → 文件列表/字段/筛选/
 *       排除规则 → .md 元数据 → 文件不存在 404 → STATUS.md 解析 → 不写文件 → 恢复配置
 * 注意：只操作 D:\我的知识库测试（测试库），不碰真实知识库；测完恢复原配置。
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const TEST = "D:\\我的知识库测试";
const TEST_POSIX = "D:/我的知识库测试";
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
  console.log(`知识库/项目库端到端验收 ${BASE}`);
  ok("未登录 GET /api/libraries → 401", (await api("/api/libraries")).status === 401);
  ok("未登录 GET /api/libraries/files → 401", (await api("/api/libraries/files")).status === 401);
  ok("未登录 GET /api/libraries/projects → 401", (await api("/api/libraries/projects")).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 准备测试库内容（只在测试库）
  fs.mkdirSync(path.join(TEST_POSIX, "笔记"), { recursive: true });
  fs.mkdirSync(path.join(TEST_POSIX, "课件和教材"), { recursive: true });
  fs.mkdirSync(path.join(TEST_POSIX, "项目库"), { recursive: true });
  const mdPath = path.join(TEST_POSIX, "笔记", "测试笔记.md");
  fs.writeFileSync(mdPath, "---\ntitle: 测试标题\ntags: [\"topic/测试\", \"course/数学\"]\n---\n# 测试标题\n正文不该被预览", "utf-8");
  fs.writeFileSync(path.join(TEST_POSIX, "笔记", "notes.txt"), "text", "utf-8");
  fs.writeFileSync(path.join(TEST_POSIX, "笔记", "api-key.md"), "# 不该出现", "utf-8");
  fs.mkdirSync(path.join(TEST_POSIX, ".obsidian"), { recursive: true });
  fs.writeFileSync(path.join(TEST_POSIX, ".obsidian", "hidden.md"), "# 隐藏", "utf-8");
  fs.writeFileSync(path.join(TEST_POSIX, "课件和教材", "讲义.pdf"), "%PDF-fake", "utf-8");
  // 项目库：一个带 STATUS.md 的项目、一个不带的
  fs.mkdirSync(path.join(TEST_POSIX, "项目库", "Alpha"), { recursive: true });
  fs.writeFileSync(path.join(TEST_POSIX, "项目库", "Alpha", "STATUS.md"),
    "progress: 60%\n- [x] 需求\n- [x] 设计\n- [ ] 开发\n- [ ] 测试\n", "utf-8");
  fs.mkdirSync(path.join(TEST_POSIX, "项目库", "Beta"), { recursive: true });
  fs.writeFileSync(path.join(TEST_POSIX, "项目库", "Beta", "README.md"), "# 随便写的 README", "utf-8");

  // 保存原配置
  const cfgBefore = await api("/api/libraries");
  const original = cfgBefore.data.config;
  ok("GET /api/libraries → 200", cfgBefore.status === 200 && Boolean(original));
  ok("默认知识库目录为测试库", original.knowledgeDirs?.some((d) => d.endsWith("我的知识库测试")), JSON.stringify(original.knowledgeDirs));
  ok("默认项目库目录为测试库下项目库", original.projectDirs?.some((d) => d.endsWith("项目库")));

  // 多目录配置 + 旧配置同步
  const put = await api("/api/libraries", {
    method: "PUT",
    body: JSON.stringify({
      knowledgeDirs: [TEST],
      projectDirs: [path.join(TEST_POSIX, "项目库")],
      indexDirs: [TEST],
      exportVault: TEST,
      dirMap: { "course/": "课件和教材", "topic/": "笔记", "type/": "笔记" },
    }),
  });
  ok("PUT 统一配置 → 200", put.status === 200 && put.data.config?.version === 1, JSON.stringify(put.data).slice(0, 160));
  const idxCfg = JSON.parse(fs.readFileSync(path.join("data", "index-config.json"), "utf-8"));
  const capCfg = JSON.parse(fs.readFileSync(path.join("data", "capture-config.json"), "utf-8"));
  ok("A8 检索配置被同步为测试库", idxCfg.dirs?.[0]?.endsWith("我的知识库测试"), JSON.stringify(idxCfg));
  ok("A10 导出配置被同步为测试库", capCfg.vault?.endsWith("我的知识库测试"), JSON.stringify(capCfg));

  // 文件列表
  const files = await api("/api/libraries/files?limit=500");
  ok("GET files → 200 含列表与目录", files.status === 200 && Array.isArray(files.data.files) && Array.isArray(files.data.dirs));
  const paths = (files.data.files ?? []).map((f) => f.path.replace(/\//g, "\\"));
  ok("列出测试笔记.md", paths.some((p) => p.endsWith("测试笔记.md")));
  ok("列出讲义.pdf", paths.some((p) => p.endsWith("讲义.pdf")));
  ok("排除 api-key.md（密钥文件）", !paths.some((p) => p.endsWith("api-key.md")));
  ok("排除 .obsidian 隐藏目录", !paths.some((p) => p.includes(".obsidian")));
  ok("排除 notes.txt? 不排除(只按密钥/隐藏排除)", paths.some((p) => p.endsWith("notes.txt")));
  const md = (files.data.files ?? []).find((f) => f.name === "测试笔记.md");
  ok("文件字段完整（名称/类型/大小/mtime/dir）",
    md && md.ext === ".md" && typeof md.size === "number" && Boolean(md.mtime) && md.dir === "笔记", JSON.stringify(md));
  ok(".md 含标题与标签元数据", md?.title === "测试标题" && md?.tags?.includes("topic/测试"), JSON.stringify(md?.tags));

  // 筛选
  const pdf = await api("/api/libraries/files?kind=pdf");
  // 连续跑多套 e2e 时测试库可能有其它脚本残留的 pdf（用户也可能自己放文件），
  // 因此只校验「筛选结果全是 pdf 且包含本脚本 fixture」，不假设全库只有自己的文件
  ok("按 kind=pdf 筛选（结果全为 pdf 且含本脚本 fixture）",
    (pdf.data.files ?? []).length >= 1
      && (pdf.data.files ?? []).every((f) => f.ext === ".pdf")
      && (pdf.data.files ?? []).some((f) => f.name === "讲义.pdf"),
    JSON.stringify(pdf.data.files));
  const byDir = await api(`/api/libraries/files?dir=${encodeURIComponent("课件和教材")}`);
  ok("按目录筛选", byDir.data.files?.length >= 1 && byDir.data.files.every((f) => f.dir.startsWith("课件和教材")), JSON.stringify(byDir.data.files));

  // 单文件元信息
  const meta = await api(`/api/libraries/files/meta?path=${encodeURIComponent(mdPath.replace(/\\/g, "/"))}`);
  ok("GET 文件元信息 → 200", meta.status === 200 && meta.data.file?.name === "测试笔记.md");
  ok("不存在文件 → 404", (await api("/api/libraries/files/meta?path=D%3A%2Fnonexistent.md")).status === 404);

  // 项目进度
  const projects = await api("/api/libraries/projects");
  ok("GET projects → 200", projects.status === 200 && Array.isArray(projects.data.projects));
  const alpha = projects.data.projects?.find((p) => p.name === "Alpha");
  const beta = projects.data.projects?.find((p) => p.name === "Beta");
  ok("Alpha 有 STATUS.md 且解析 progress=60", alpha?.hasStatus === true && alpha.progress === 60, JSON.stringify(alpha));
  ok("Alpha checkbox 解析为 2/4", alpha?.tasks?.done === 2 && alpha.tasks?.total === 4, JSON.stringify(alpha?.tasks));
  ok("Beta 无 STATUS.md（不猜 README）", beta?.hasStatus === false, JSON.stringify(beta));
  ok("项目名/路径字段完整", Boolean(alpha?.name && alpha?.path));

  // 不写文件：确认测试库内容没被本项目改动（除测试自己创建的）
  const beforeCount = fs.readdirSync(path.join(TEST_POSIX, "笔记")).length;
  await api("/api/libraries/files?limit=10");
  await api("/api/libraries/projects");
  ok("浏览/看板不新增文件", fs.readdirSync(path.join(TEST_POSIX, "笔记")).length === beforeCount);

  // 恢复原配置
  await api("/api/libraries", { method: "PUT", body: JSON.stringify({
    knowledgeDirs: original.knowledgeDirs,
    projectDirs: original.projectDirs,
    indexDirs: original.indexDirs,
    exportVault: original.exportVault,
    dirMap: original.dirMap,
  }) });
  // 清理测试文件（保留测试库目录本身）
  for (const f of [mdPath, path.join(TEST_POSIX, "笔记", "notes.txt"), path.join(TEST_POSIX, "笔记", "api-key.md"),
    path.join(TEST_POSIX, ".obsidian", "hidden.md"), path.join(TEST_POSIX, "课件和教材", "讲义.pdf"),
    path.join(TEST_POSIX, "项目库", "Alpha", "STATUS.md"), path.join(TEST_POSIX, "项目库", "Beta", "README.md")]) {
    try { fs.unlinkSync(f); } catch {}
  }
  for (const d of ["笔记", "课件和教材", ".obsidian", "项目库/Alpha", "项目库/Beta", "项目库"]) {
    try { fs.rmdirSync(path.join(TEST_POSIX, d)); } catch {}
  }

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
