/**
 * 二期 B3：暂存区整理（git）+「整理新笔记」端到端验收
 * 用法：先启动服务（next start），再 node scripts/e2e-tidy.mjs
 *
 * 覆盖：
 *  401 三接口 → 状态读取（inbox/选项默认值）→ 未整理目录不存在时给原因
 *  → 预览纯读（不改文件、不 init git）→ 标签映射目录 + YYYY-MM-DD_标题 命名
 *  → 非 .md / 密钥文件 / 同名冲突 跳过 → 确认执行：真移动 + 一次 commit + tidy-log
 *  → 重复整理空转 → 未提交改动暂停 → 打标签开关（默认关，开了才补 #type/笔记）
 *  → 占用检测（尽力而为，Windows 上可能模拟不出）→ 未整理目录越出测试库 400
 *  → 真实知识库零接触 → 清理（删 .git / 恢复配置 / 恢复 tidy-log）
 *
 * 注意：只操作 D:\我的知识库测试；不调用模型、不产生费用。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const TEST = "D:\\我的知识库测试";
const TEST_POSIX = "D:/我的知识库测试";
const INBOX = path.join(TEST_POSIX, "未整理");
const REAL = "D:\\我的知识库";
const DATA_DIR = "D:\\我的知识库\\develop\\Fold_\\data";
const LOG_FILE = path.join(DATA_DIR, "tidy-log.json");

let token = "";
let passed = 0, failed = 0, warned = 0;

function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
/** 环境限制导致无法模拟时不计失败，但如实打印 */
function warn(name, why) {
  warned++;
  console.log(`  ⚠ ${name} —— ${why}`);
}
async function api(p, options = {}) {
  // 仅对传输层瞬时错误（ECONNRESET / 连接被拒）重试；HTTP 4xx/5xx 是正常返回，不重试
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}${p}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
      });
      let data = {};
      try { data = await res.json(); } catch {}
      return { status: res.status, data };
    } catch (e) {
      lastErr = e;
      const code = e?.cause?.code ?? e?.code;
      if (attempt < 2 && (code === "ECONNRESET" || code === "ECONNREFUSED" || e?.name === "TypeError")) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
function put(body) { return api("/api/libraries", { method: "PUT", body: JSON.stringify(body) }); }
function git(args) {
  try {
    return { ok: true, out: execFileSync("git", ["-C", TEST_POSIX, ...args], { encoding: "utf-8", windowsHide: true }).trim() };
  } catch (e) { return { ok: false, out: String(e.stderr ?? e.message ?? "") }; }
}
function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...allFiles(p));
    else out.push(p);
  }
  return out;
}
function rm(p) { try { fs.rmSync(p, { force: true }); } catch {} }
/** 只清测试库内容（保留 .git，由调用方决定何时删） */
function cleanVault() {
  for (const name of fs.readdirSync(TEST_POSIX)) {
    if (name === ".git") continue;
    try { fs.rmSync(path.join(TEST_POSIX, name), { recursive: true, force: true }); } catch {}
  }
}
/**
 * 删测试库 .git：git 对象文件默认只读，某些 Windows 环境的回收站式删除会 abort，
 * 导致「测试库已清空」断言假失败。先递归去掉只读属性，再回落系统 rmdir 强删。
 */
function rmGit() {
  const g = path.join(TEST_POSIX, ".git");
  if (!fs.existsSync(g)) return;
  const chmodAll = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) chmodAll(p);
      else { try { fs.chmodSync(p, 0o666); } catch {} }
    }
  };
  try { chmodAll(g); fs.rmSync(g, { recursive: true, force: true }); return; } catch { /* 回落 */ }
  try {
    execFileSync("cmd", ["/c", "rmdir", "/S", "/Q", g.replace(/\//g, "\\")], { windowsHide: true, stdio: "ignore" });
  } catch (e) {
    console.log(`  ! 未能删除 .git：${e.message}（请手动删除 ${g}）`);
  }
}
function cfgBody(cfg, overrides = {}) {
  return {
    knowledgeDirs: cfg.knowledgeDirs,
    projectDirs: cfg.projectDirs,
    indexDirs: cfg.indexDirs,
    exportVault: cfg.exportVault,
    dirMap: cfg.dirMap,
    obsidianVault: cfg.obsidianVault ?? "",
    inboxDir: cfg.inboxDir,
    tidy: cfg.tidy,
    ...overrides,
  };
}
const read = (p) => fs.readFileSync(p, "utf-8");
const md = (fm, body) => `${fm}\n${body}\n`;

async function main() {
  console.log(`暂存区整理端到端验收 ${BASE}`);

  // 0) 未登录
  ok("未登录 GET /api/tidy → 401", (await api("/api/tidy")).status === 401);
  ok("未登录 POST /api/tidy/preview → 401", (await api("/api/tidy/preview", { method: "POST" })).status === 401);
  ok("未登录 POST /api/tidy/run → 401", (await api("/api/tidy/run", { method: "POST" })).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // 备份：配置 + tidy-log（收尾恢复）
  const cfg0 = await api("/api/libraries");
  const original = cfg0.data.config;
  ok("GET /api/libraries → 200", cfg0.status === 200 && Boolean(original));
  // 把配置拨到「已知基线」再做断言，避免上一次跑挂掉留下的残留影响结果
  const baseCfg = await put(cfgBody(original, { inboxDir: INBOX.replace(/\//g, "\\"), tidy: { move: true, rename: true, tag: false } }));
  ok("PUT 基线配置 → 200", baseCfg.status === 200, JSON.stringify(baseCfg.data).slice(0, 160));
  ok("libraries.json 有 inboxDir 且指向测试库未整理",
    typeof baseCfg.data.config?.inboxDir === "string" && baseCfg.data.config.inboxDir.includes("我的知识库测试"),
    String(baseCfg.data.config?.inboxDir));
  ok("整理选项基线：移动✓ 重命名✓ 打标签✗",
    baseCfg.data.config?.tidy?.move === true && baseCfg.data.config?.tidy?.rename === true && baseCfg.data.config?.tidy?.tag === false,
    JSON.stringify(baseCfg.data.config?.tidy));
  const logBackup = fs.existsSync(LOG_FILE) ? read(LOG_FILE) : null;
  // 真实库快照（只读对比，用来证明零接触）
  const realInbox = path.join(REAL, "未整理");
  const snapReal = () => allFiles(realInbox).map((f) => `${f}|${fs.statSync(f).mtimeMs}`).join("|");
  const realBefore = snapReal();

  // 清场：本次测试从「无 git 仓库」开始（rmGit 会先去只读属性再回落强删）
  rmGit();
  const startedCleanRepo = !fs.existsSync(path.join(TEST_POSIX, ".git"));
  if (!startedCleanRepo) console.log("  ! 无法清理已有 .git，将按「已有仓库」口径断言");

  // 1) 未整理目录不存在
  cleanVault();
  if (fs.existsSync(INBOX)) fs.rmSync(INBOX, { recursive: true, force: true });
  const missing = await api("/api/tidy");
  ok("GET /api/tidy → 200", missing.status === 200, JSON.stringify(missing.data).slice(0, 160));
  ok("未整理目录不存在时不可执行并给出原因",
    missing.data.canRun === false && typeof missing.data.blockedReason === "string" && missing.data.blockedReason.includes("不存在"),
    JSON.stringify(missing.data.blockedReason));

  // 2) 造 fixture
  fs.mkdirSync(path.join(INBOX, "子目录"), { recursive: true });
  const fC1 = path.join(INBOX, "c1.md");
  const fT1 = path.join(INBOX, "t1.md");
  const fN1 = path.join(INBOX, "n1.md");
  const fPdf = path.join(INBOX, "附件.pdf");
  const fKey = path.join(INBOX, "api-key.md");
  const fSub = path.join(INBOX, "子目录", "s1.md");
  fs.writeFileSync(fC1, md('---\ntags:\n  - "#course/微积分"\ncreated: 2026-11-01\n---', "# 极限的定义\n\n正文内容"), "utf-8");
  fs.writeFileSync(fT1, md('---\ntags: ["#topic/极限"]\n---', "# 数列收敛\n\n正文内容"), "utf-8");
  fs.writeFileSync(fN1, "# 随手想法\n\n无 frontmatter 的笔记", "utf-8");
  fs.writeFileSync(fPdf, "PDF-FAKE", "utf-8");
  fs.writeFileSync(fKey, "# 密钥\n\n不应被整理", "utf-8");
  fs.writeFileSync(fSub, md('---\ntags: ["#topic/子目录里的"]\ncreated: 2026-11-03\n---', "# 子目录笔记"), "utf-8");

  const filesBeforePreview = allFiles(TEST_POSIX).sort().join("|");
  const status1 = await api("/api/tidy");
  ok("状态里未整理文件数 = 6", status1.data.counts?.total === 6, JSON.stringify(status1.data.counts));

  // 3) 预览（纯读）
  const pv = await api("/api/tidy/preview", { method: "POST" });
  ok("POST /api/tidy/preview → 200", pv.status === 200, JSON.stringify(pv.data).slice(0, 200));
  const preview = pv.data.preview;
  ok("预览 totals：6 个文件 / 4 可执行 / 2 跳过",
    preview?.counts?.total === 6 && preview?.counts?.ready === 4 && preview?.counts?.skipped === 2,
    JSON.stringify(preview?.counts));
  const itemOf = (name) => (preview?.items ?? []).find((i) => i.from.endsWith(name));
  ok("course 标签 → 课件和教材 目录", itemOf("c1.md")?.dir === "课件和教材", JSON.stringify(itemOf("c1.md")));
  ok("created 参与命名：2026-11-01_极限的定义.md", itemOf("c1.md")?.filename === "2026-11-01_极限的定义.md", String(itemOf("c1.md")?.filename));
  ok("topic 标签 → 笔记 目录", itemOf("t1.md")?.dir === "笔记", JSON.stringify(itemOf("t1.md")?.dir));
  ok("无标签 → 回落 笔记 目录（与 A10 一致）", itemOf("n1.md")?.dir === "笔记", JSON.stringify(itemOf("n1.md")?.dir));
  ok("子目录里的笔记也会被扫到", Boolean(itemOf("s1.md")) && itemOf("s1.md")?.dir === "笔记");
  ok("非 .md 跳过并说明原因", itemOf("附件.pdf")?.status === "skip" && /非 \.md/.test(itemOf("附件.pdf")?.reason ?? ""), JSON.stringify(itemOf("附件.pdf")?.reason));
  ok("疑似密钥文件跳过（沿用 B1 排除规则）", itemOf("api-key.md")?.status === "skip", JSON.stringify(itemOf("api-key.md")?.reason));
  ok("预览不动任何文件", allFiles(TEST_POSIX).sort().join("|") === filesBeforePreview);
  ok("预览不 init git", !fs.existsSync(path.join(TEST_POSIX, ".git")));

  // 4) 同名冲突 + 占用（预览阶段，仓库尚未 init）
  fs.mkdirSync(path.join(TEST_POSIX, "课件和教材"), { recursive: true });
  const fC2 = path.join(INBOX, "c2.md");
  const conflictTarget = path.join(TEST_POSIX, "课件和教材", "2026-11-02_同名冲突.md");
  fs.writeFileSync(fC2, md('---\ntags: ["#course/微积分"]\ncreated: 2026-11-02\n---', "# 同名冲突"), "utf-8");
  fs.writeFileSync(conflictTarget, "# 已存在的旧文件", "utf-8");

  const fLocked = path.join(INBOX, "locked.md");
  fs.writeFileSync(fLocked, md('---\ntags: ["#topic/占用"]\n---', "# 被占用"), "utf-8");
  let chmodOk = true;
  try { fs.chmodSync(fLocked, 0o444); } catch { chmodOk = false; }
  let lockSimulated = false;
  if (chmodOk) {
    try { const fd = fs.openSync(fLocked, "r+"); fs.closeSync(fd); }
    catch { lockSimulated = true; }
  }

  const pv2 = await api("/api/tidy/preview", { method: "POST" });
  const preview2 = pv2.data.preview;
  const item2 = (n) => (preview2?.items ?? []).find((i) => i.from.endsWith(n));
  ok("同名冲突 → 跳过且不覆盖", item2("c2.md")?.status === "skip" && /同名/.test(item2("c2.md")?.reason ?? ""), JSON.stringify(item2("c2.md")));
  ok("冲突目标文件内容未被改写", read(conflictTarget) === "# 已存在的旧文件");
  if (lockSimulated) {
    ok("被占用文件 → 跳过并说明占用", item2("locked.md")?.status === "skip" && /占用|不可写/.test(item2("locked.md")?.reason ?? ""), JSON.stringify(item2("locked.md")));
  } else {
    warn("占用检测", "当前文件系统上无法模拟独占写锁（只读属性未生效），跳过该断言；实现见 src/lib/tidy.ts isLocked()");
  }
  if (chmodOk) { try { fs.chmodSync(fLocked, 0o666); } catch {} }

  // 5) 确认执行：真移动 + 一次 commit（locked.md 保持只读直到执行后，才测得到占用跳过）
  const run1 = await api("/api/tidy/run", { method: "POST" });
  ok("POST /api/tidy/run → 200", run1.status === 200, JSON.stringify(run1.data).slice(0, 240));
  const r1 = run1.data.result;
  ok("首次整理自动 git init（仅测试库）", r1?.inited === startedCleanRepo, JSON.stringify({ inited: r1?.inited, startedCleanRepo }));
  ok("执行后测试库出现 .git", fs.existsSync(path.join(TEST_POSIX, ".git")));
  ok("移动到 课件和教材/2026-11-01_极限的定义.md", fs.existsSync(path.join(TEST_POSIX, "课件和教材", "2026-11-01_极限的定义.md")));
  ok("移动到 笔记/2026-11-20_数列收敛.md", fs.existsSync(path.join(TEST_POSIX, "笔记", "2026-11-20_数列收敛.md")));
  ok("无标签笔记按 笔记 目录落位", fs.existsSync(path.join(TEST_POSIX, "笔记", "2026-11-20_随手想法.md")));
  ok("子目录笔记也被整理", fs.existsSync(path.join(TEST_POSIX, "笔记", "2026-11-03_子目录笔记.md")));
  ok("源文件已从 未整理 移走", !fs.existsSync(fC1) && !fs.existsSync(fT1) && !fs.existsSync(fSub));
  ok("冲突文件仍留在未整理目录", fs.existsSync(fC2));
  ok("非 .md 与密钥文件不动", fs.existsSync(fPdf) && fs.existsSync(fKey));
  ok("返回 commit 短 hash", typeof r1?.commit === "string" && r1.commit.length >= 6, String(r1?.commit));

  const log = git(["log", "--oneline"]);
  ok("仓库恰好 1 个提交（一次整理 = 一次 commit）", log.ok && log.out.split(/\r?\n/).filter(Boolean).length === 1, log.out);
  ok("提交信息含日期与文件数", /整理未整理笔记 \d{4}-\d{2}-\d{2}（\d+ 个文件）/.test(git(["log", "-1", "--pretty=%s"]).out), git(["log", "-1", "--pretty=%s"]).out);
  ok("提交里包含被移动的笔记", git(["-c", "core.quotepath=false", "show", "--name-only", "--pretty=", "HEAD"]).out.includes("极限的定义"));
  if (chmodOk) { try { fs.chmodSync(fLocked, 0o666); } catch {} }

  const tidyLog = JSON.parse(read(LOG_FILE));
  ok("tidy-log.json 记录本次 commit 与清单",
    Array.isArray(tidyLog) && tidyLog[0]?.commit === r1?.commit && Array.isArray(tidyLog[0]?.moved) && tidyLog[0].moved.length >= 4,
    JSON.stringify(tidyLog?.[0]?.commit));
  ok("默认不写 #type/笔记（打标签默认关闭）",
    !read(path.join(TEST_POSIX, "课件和教材", "2026-11-01_极限的定义.md")).includes("type/笔记"));
  ok("原 frontmatter 标签保留", read(path.join(TEST_POSIX, "课件和教材", "2026-11-01_极限的定义.md")).includes("#course/微积分"));

  // 6) 清掉冲突测试残留，再确认工作区干净（冲突目标文件是未跟踪的新文件，属实现定义的「脏」）
  rm(fC2); rm(conflictTarget); rm(fLocked); rm(fPdf); rm(fKey);
  const pv3 = await api("/api/tidy");
  ok("整理后工作区干净（无未提交改动）", pv3.data.dirty === false, JSON.stringify(pv3.data.dirtyFiles));
  ok("仅剩跳过项时不可执行", pv3.data.canRun === false, JSON.stringify(pv3.data.blockedReason));
  const runEmpty = await api("/api/tidy/run", { method: "POST" });
  ok("无可整理文件时执行 → 400", runEmpty.status === 400, JSON.stringify(runEmpty.data));

  // 7) 未提交改动 → 暂停
  const movedC1 = path.join(TEST_POSIX, "课件和教材", "2026-11-01_极限的定义.md");
  const originalBody = read(movedC1);
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(path.join(INBOX, "d1.md"), md('---\ntags: ["#topic/脏测试"]\n---', "# 脏工作区"), "utf-8");
  fs.writeFileSync(movedC1, `${originalBody}\n手改一行`, "utf-8");
  const dirtyStatus = await api("/api/tidy");
  ok("有未提交改动时标记 dirty", dirtyStatus.data.dirty === true, JSON.stringify(dirtyStatus.data.dirtyFiles));
  const dirtyRun = await api("/api/tidy/run", { method: "POST" });
  ok("有未提交改动时执行被拒绝（400）", dirtyRun.status === 400 && /未提交改动/.test(dirtyRun.data.error ?? ""), JSON.stringify(dirtyRun.data));
  ok("被拒绝时未移动新文件", fs.existsSync(path.join(INBOX, "d1.md")));
  fs.writeFileSync(movedC1, originalBody, "utf-8");
  const cleanAgain = await api("/api/tidy");
  ok("还原内容后恢复可执行（不依赖 mtime）", cleanAgain.data.dirty === false, JSON.stringify(cleanAgain.data.dirtyFiles));

  // 8) 打开「打标签」开关 → 补 #type/笔记
  const putTag = await put(cfgBody(original, { tidy: { move: true, rename: true, tag: true } }));
  ok("PUT 打开打标签开关 → 200 且生效", putTag.status === 200 && putTag.data.config?.tidy?.tag === true, JSON.stringify(putTag.data.config?.tidy));
  const pvTag = await api("/api/tidy/preview", { method: "POST" });
  const tagItem = (pvTag.data.preview?.items ?? []).find((i) => i.from.endsWith("d1.md"));
  ok("开启后预览出现「打标签」动作", (tagItem?.actions ?? []).includes("打标签"), JSON.stringify(tagItem?.actions));
  const runTag = await api("/api/tidy/run", { method: "POST" });
  ok("开启后执行 → 200", runTag.status === 200, JSON.stringify(runTag.data).slice(0, 200));
  const tagged = path.join(TEST_POSIX, "笔记", "2026-11-20_脏工作区.md");
  ok("文件落下且补上 #type/笔记", fs.existsSync(tagged) && read(tagged).includes('"#type/笔记"'), fs.existsSync(tagged) ? read(tagged).split(/\r?\n/).slice(0, 8).join(" / ") : "缺文件");
  ok("补标签未丢原有 topic 标签", read(tagged).includes("topic/脏测试"));
  ok("第二次整理有独立提交", git(["log", "--oneline"]).out.split(/\r?\n/).filter(Boolean).length === 2);
  await put(cfgBody(original, { tidy: original.tidy }));

  // 9) 越权：未整理目录越出测试库
  const escape = await put(cfgBody(original, { inboxDir: path.join(REAL, "未整理") }));
  ok("PUT 允许写配置（校验在执行期）", escape.status === 200);
  const escStatus = await api("/api/tidy");
  ok("未整理目录指向真实库 → GET 400 拒绝", escStatus.status === 400 && /测试知识库/.test(escStatus.data.error ?? ""), JSON.stringify(escStatus.data));
  const escPreview = await api("/api/tidy/preview", { method: "POST" });
  ok("未整理目录指向真实库 → 预览 400 拒绝", escPreview.status === 400, JSON.stringify(escPreview.data));
  const escRun = await api("/api/tidy/run", { method: "POST" });
  ok("未整理目录指向真实库 → 执行 400 拒绝", escRun.status === 400, JSON.stringify(escRun.data));
  await put(cfgBody(original));

  // 10) 真实知识库零接触（真实库本来就有「未整理」目录，只对比内容与修改时间是否变化）
  ok("真实库 未整理 目录零改动（文件与 mtime 全部一致）", snapReal() === realBefore);
  ok("真实库根目录未被 git init", !fs.existsSync(path.join(REAL, ".git")));

  // 11) 清理
  cleanVault();
  for (const d of ["未整理", "笔记", "课件和教材", "资源库", "项目库"]) rm(path.join(TEST_POSIX, d));
  rmGit();
  if (logBackup === null) rm(LOG_FILE); else fs.writeFileSync(LOG_FILE, logBackup, "utf-8");
  const restored = await api("/api/libraries");
  ok("配置已恢复（inboxDir/选项回到原值）",
    restored.data.config?.inboxDir === original.inboxDir &&
    JSON.stringify(restored.data.config?.tidy) === JSON.stringify(original.tidy),
    JSON.stringify(restored.data.config?.tidy));
  ok("测试库已清空且无 .git", allFiles(TEST_POSIX).length === 0 && !fs.existsSync(path.join(TEST_POSIX, ".git")), String(allFiles(TEST_POSIX).length));

  console.log(`\n结果：${passed} 通过，${failed} 失败${warned ? `，${warned} 项环境限制未断言` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
