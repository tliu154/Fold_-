/**
 * C3 第 2 轮验收：树状文件管理器 / 系统打开 / 拖拽上传 / 加库
 *
 * 覆盖：401 鉴权、树数据字段、打开方式映射（HTML 走 Obsidian）、
 * 越权与排除规则、文件夹双击开资源管理器、拖拽单文件入暂存区、
 * 同名加序号、20MB 上限、加库/移除库/重复/嵌套/不存在目录、
 * 真实库零接触、收尾恢复配置与文件。
 *
 * 注意：本脚本会真的调起一次系统文件管理器（验证文件夹双击链路），
 * 属预期行为；不写用户库、不改任何已有文件内容。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";
import { ensureSeed, clearSeed, vaultStatus, TEST_VAULT as TEST } from "./seed-vault.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = process.cwd();
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? "./data");
const DB_FILE = path.join(DATA, "fold.sqlite");
const LIB_CFG = path.join(DATA, "libraries.json");
const UNSORTED = path.join(DATA, "internal-vault", "未分类");
// 平级临时库：不能建在测试库内部，否则会被「与已有库嵌套」校验拒绝（这是产品预期行为，
// 避免同一批文件被两个库重复扫描）。用一个 D 盘根下的独立目录，收尾整目录删掉。
const NEW_VAULT = "D:/Fold_E2E_Vault";

let passed = 0, failed = 0, warned = 0;
function ok(label, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}
function note(label, cond, detail = "") { if (!cond) { warned++; console.log(`  ! ${label} ${detail}`); } }
function db() { return new Database(DB_FILE); }
function forceRemove(p) {
  if (!fs.existsSync(p)) return;
  try { fs.rmSync(p, { recursive: true, force: true }); return; } catch { /* 回落 */ }
  try { execFileSync("cmd", ["/c", "rmdir", "/S", "/Q", p.replace(/\//g, "\\")], { windowsHide: true }); } catch {}
}

let cookie = "";
async function api(pathname, opts = {}) {
  const { method = "GET", body, noAuth = false, headers = {} } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const h = { ...headers };
  if (!noAuth && cookie) h.Cookie = cookie;
  if (body !== undefined && !isForm) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathname, {
    method, headers: h,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { status: 0, data: {} };
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
function login() { return api("/api/auth/login", { method: "POST", body: { password: PASSWORD } }); }

async function main() {
  console.log("=== C3 第 2 轮：文件树 / 系统打开 / 拖拽 / 加库 ===");

  /* ---------- 401 ---------- */
  ok("未登录文件列表 → 401", (await api("/api/libraries/files", { noAuth: true })).status === 401);
  ok("未登录系统打开 → 401", (await api("/api/system-open", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("未登录上传 → 401", (await api("/api/internal-files/upload", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("未登录加库 → 401", (await api("/api/libraries/vaults", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("未登录注册表 → 401", (await api("/api/settings", { noAuth: true })).status === 401);

  ok("登录 → 200", (await login()).status === 200);

  /* ---------- 前置：备份配置、造种子与临时 fixture ---------- */
  const libBackup = fs.existsSync(LIB_CFG) ? fs.readFileSync(LIB_CFG, "utf-8") : null;
  const hadSeed = vaultStatus().seedPresent > 0;
  ensureSeed();
  forceRemove(NEW_VAULT); // 清掉上次中断可能留下的残留
  fs.mkdirSync(NEW_VAULT, { recursive: true });
  fs.writeFileSync(path.join(NEW_VAULT, "FT_加库.md"), "# 加库测试\n", "utf-8");
  fs.writeFileSync(path.join(TEST, "笔记", "api-key.md"), "# 不该被打开\n", "utf-8");
  fs.mkdirSync(path.join(TEST, ".hidden"), { recursive: true });
  fs.writeFileSync(path.join(TEST, ".hidden", "FT_hidden.md"), "hidden\n", "utf-8");

  /* ---------- 树数据 ---------- */
  const list = await api("/api/libraries/files?limit=500");
  ok("文件列表 → 200", list.status === 200, String(list.status));
  const files = list.data.files ?? [];
  ok("树数据非空（含种子）", files.length >= 15, `count=${files.length}`);
  ok("每个条目都有建树所需字段", files.every((f) =>
    typeof f.path === "string" && typeof f.name === "string" && typeof f.dir === "string"
    && typeof f.root === "string" && typeof f.ext === "string"
    && typeof f.size === "number" && typeof f.mtime === "string"));
  ok("目录字段可用于分层（含多级）", files.some((f) => f.dir.includes("/")), JSON.stringify([...new Set(files.map((f) => f.dir))].slice(0, 6)));
  ok("种子含非 Markdown 全格式", [".html", ".png", ".pdf", ".docx"].every((e) => files.some((f) => f.ext === e)));
  ok("接口不再需要格式分类参数", list.data.total >= files.length);

  /* ---------- 打开方式映射（HTML 走 Obsidian，用户拍板） ---------- */
  const settings = await api("/api/settings");
  const ow = settings.data.values?.open_with;
  ok("打开方式映射：.md/.html/.htm/.pdf 走 Obsidian",
    [".md", ".html", ".htm", ".pdf"].every((e) => (ow?.obsidian_exts ?? []).includes(e)), JSON.stringify(ow));
  ok("打开方式映射：其它格式走系统", ow?.default === "system" && !(ow?.obsidian_exts ?? []).includes(".png"));
  ok("注册表登记 4 项试点", (settings.data.catalog ?? []).length === 4);
  ok("敏感项清单含库路径/密钥/目录映射", ["knowledgeDirs", "exportVault", "dirMap", "obsidianVault"]
    .every((k) => (settings.data.manualOnly ?? []).includes(k)));

  /* ---------- 临时设置 Obsidian 库名，验证 uri 生成 ---------- */
  const cfg = (await api("/api/libraries")).data.config;
  const put = await api("/api/libraries", {
    method: "PUT",
    body: {
      knowledgeDirs: cfg.knowledgeDirs, projectDirs: cfg.projectDirs, indexDirs: cfg.indexDirs,
      exportVault: cfg.exportVault, dirMap: cfg.dirMap, inboxDir: cfg.inboxDir, tidy: cfg.tidy,
      obsidianVault: "我的知识库测试",
    },
  });
  ok("临时设置 Obsidian 库名 → 200", put.status === 200, String(put.status));

  const mdOpen = await api("/api/system-open", {
    method: "POST", body: { root: TEST, rel: "笔记/极限与连续.md", kind: "file" },
  });
  ok("打开 .md → 200", mdOpen.status === 200, JSON.stringify(mdOpen.data).slice(0, 180));
  ok(".md 走 Obsidian", mdOpen.data.mode === "obsidian" && String(mdOpen.data.uri ?? "").startsWith("obsidian://open?vault="),
    JSON.stringify(mdOpen.data).slice(0, 180));
  ok("接口不回显服务器绝对路径", !JSON.stringify(mdOpen.data).includes("D:\\") && !JSON.stringify(mdOpen.data).includes("D:/"));

  const htmlOpen = await api("/api/system-open", {
    method: "POST", body: { root: TEST, rel: "资源库/导出的页面.html", kind: "file" },
  });
  ok("打开 HTML → 200", htmlOpen.status === 200, JSON.stringify(htmlOpen.data).slice(0, 180));
  ok("HTML 走 Obsidian（用户拍板，非系统浏览器）",
    htmlOpen.data.mode === "obsidian" && String(htmlOpen.data.uri ?? "").includes(".html"),
    JSON.stringify(htmlOpen.data).slice(0, 200));

  /* ---------- 越权与排除 ---------- */
  const evilAbs = await api("/api/system-open", { method: "POST", body: { path: "D:/Windows/System32", kind: "folder" } });
  ok("库外绝对路径 → 403", evilAbs.status === 403, String(evilAbs.status));
  const evilReal = await api("/api/system-open", { method: "POST", body: { path: "D:/我的知识库/笔记/x.md", kind: "file" } });
  ok("未加入的其它库路径 → 403", evilReal.status === 403, String(evilReal.status));
  const evilUp = await api("/api/system-open", { method: "POST", body: { root: TEST, rel: "../Windows/win.ini", kind: "file" } });
  ok(".. 越界 → 403", evilUp.status === 403, String(evilUp.status));
  const evilKey = await api("/api/system-open", { method: "POST", body: { root: TEST, rel: "笔记/api-key.md", kind: "file" } });
  ok("密钥文件名 → 403", evilKey.status === 403, String(evilKey.status));
  const evilHidden = await api("/api/system-open", { method: "POST", body: { root: TEST, rel: ".hidden/FT_hidden.md", kind: "file" } });
  ok("隐藏目录 → 403", evilHidden.status === 403, String(evilHidden.status));
  const evilMissing = await api("/api/system-open", { method: "POST", body: { root: TEST, rel: "笔记/不存在.md", kind: "file" } });
  ok("不存在的文件 → 403", evilMissing.status === 403, String(evilMissing.status));

  /* ---------- 文件夹双击：调起系统文件管理器 ---------- */
  const folderOpen = await api("/api/system-open", { method: "POST", body: { root: TEST, rel: "笔记", kind: "folder" } });
  ok("文件夹双击 → 200 且走系统", folderOpen.status === 200 && folderOpen.data.mode === "system",
    JSON.stringify(folderOpen.data).slice(0, 200));
  ok("文件夹打开已向系统发起请求", folderOpen.data.launched === true);
  note("系统打开为异步，浏览器无法确认外部应用是否真的启动", Boolean(folderOpen.data.note), JSON.stringify(folderOpen.data));

  /* ---------- 加库 ---------- */
  const add = await api("/api/libraries/vaults", { method: "POST", body: { path: NEW_VAULT } });
  ok("添加一个库 → 200", add.status === 200, JSON.stringify(add.data).slice(0, 180));
  ok("新库进入 knowledgeDirs", (add.data.config?.knowledgeDirs ?? []).some((d) => path.resolve(String(d)).toLowerCase() === path.resolve(NEW_VAULT).toLowerCase()));
  ok("写入目标 exportVault 不因加库而变", add.data.config?.exportVault === cfg.exportVault);
  const afterAdd = await api("/api/libraries/files?limit=500");
  ok("加库后根下文件出现在浏览里", (afterAdd.data.files ?? []).some((f) => f.name === "FT_加库.md"));
  ok("重复加同一个库 → 400", (await api("/api/libraries/vaults", { method: "POST", body: { path: NEW_VAULT } })).status === 400);
  ok("加不存在的目录 → 400", (await api("/api/libraries/vaults", { method: "POST", body: { path: path.join(TEST, "_不存在_xyz") } })).status === 400);
  ok("加与已有库嵌套的子目录 → 400", (await api("/api/libraries/vaults", { method: "POST", body: { path: path.join(TEST, "笔记") } })).status === 400);
  const del = await api("/api/libraries/vaults", { method: "DELETE", body: { path: NEW_VAULT } });
  ok("移除库 → 200", del.status === 200, String(del.status));
  ok("移除后 knowledgeDirs 恢复", !(del.data.config?.knowledgeDirs ?? []).some((d) => path.resolve(String(d)).toLowerCase() === path.resolve(NEW_VAULT).toLowerCase()));
  ok("移除未加入的库 → 400", (await api("/api/libraries/vaults", { method: "DELETE", body: { path: NEW_VAULT } })).status === 400);

  /* ---------- 拖拽上传 ---------- */
  const up1 = await api("/api/internal-files/upload", {
    method: "POST",
    body: (() => { const f = new FormData(); f.append("file", new Blob(["# 拖拽上传测试\n"], { type: "text/markdown" }), "FT_拖拽.md"); return f; })(),
  });
  ok("拖单文件 → 201", up1.status === 201, JSON.stringify(up1.data).slice(0, 180));
  ok("登记为内部库文件（subtype=other / status=unsorted）",
    up1.data.file?.subtype === "other" && up1.data.file?.status === "unsorted");
  ok("物理文件落在未分类区", fs.existsSync(path.join(UNSORTED, "FT_拖拽.md")));
  const up2 = await api("/api/internal-files/upload", {
    method: "POST",
    body: (() => { const f = new FormData(); f.append("file", new Blob(["again"]), "FT_拖拽.md"); return f; })(),
  });
  ok("同名再拖不覆盖，自动加序号", up2.status === 201 && up2.data.file?.filename === "FT_拖拽_1.md",
    String(up2.data.file?.filename));
  const upBad = await api("/api/internal-files/upload", { method: "POST", body: {} });
  ok("没有文件字段 → 400", upBad.status === 400, String(upBad.status));
  const big = await api("/api/internal-files/upload", {
    method: "POST",
    body: (() => { const f = new FormData(); f.append("file", new Blob([Buffer.alloc(21 * 1024 * 1024)]), "FT_超大.bin"); return f; })(),
  });
  ok("超过 20MB → 400", big.status === 400, String(big.status));
  const upKey = await api("/api/internal-files/upload", {
    method: "POST",
    body: (() => { const f = new FormData(); f.append("file", new Blob(["secret"]), "api-key.md"); return f; })(),
  });
  ok("疑似密钥文件名 → 400", upKey.status === 400, String(upKey.status));

  /* ---------- 收尾：恢复配置、清临时文件、恢复种子状态 ---------- */
  if (libBackup !== null) fs.writeFileSync(LIB_CFG, libBackup, "utf-8");
  forceRemove(NEW_VAULT);
  forceRemove(path.join(TEST, ".hidden"));
  forceRemove(path.join(TEST, "笔记", "api-key.md"));
  for (const n of fs.readdirSync(UNSORTED)) {
    if (n.startsWith("FT_")) forceRemove(path.join(UNSORTED, n));
  }
  try {
    const d = db();
    const rows = d.prepare("SELECT id, payload FROM items WHERE type = 'file'").all();
    let n = 0;
    for (const r of rows) {
      try {
        const p = JSON.parse(r.payload || "{}");
        if (String(p.filename ?? "").startsWith("FT_")) { d.prepare("DELETE FROM items WHERE id = ?").run(r.id); n++; }
      } catch { /* ignore */ }
    }
    d.close();
    ok("上传产生的登记已清理", n >= 2, `removed=${n}`);
  } catch (e) { ok("上传产生的登记已清理", false, String(e)); }
  const cfgBack = (await api("/api/libraries")).data.config;
  ok("Obsidian 库名已恢复", cfgBack?.obsidianVault === cfg.obsidianVault, JSON.stringify({ before: cfg.obsidianVault, after: cfgBack?.obsidianVault }));
  if (!hadSeed) clearSeed();
  ok("真实库零接触（临时库是平级独立目录、不落在用户日常库内；上传目标在项目 data 内）",
    !path.resolve(NEW_VAULT).toLowerCase().startsWith("d:\\我的知识库\\")
    && path.resolve(UNSORTED).toLowerCase().startsWith(path.resolve(DATA).toLowerCase()));

  console.log(`\n结果：${passed} 通过，${failed} 失败，${warned} 说明`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
