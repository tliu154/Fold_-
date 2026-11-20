/**
 * 三期 C2：审批闸门（AI 提案 → 用户批准才执行）端到端验收
 * 用法：先启动服务（next start），再 node scripts/e2e-proposals.mjs
 *
 * 覆盖：
 *  401 五接口 → 生成预览不落库/不写文件/不 init git → 合规标签纯规则（不调模型）
 *  → 1 次最小真实模型调用（只补弱标签；429/不可用如实标注）→ AI 建议不写 frontmatter
 *  → 保存才落库 + kind=proposal 站内消息 → 同文件去重不重复通知
 *  → 逐条勾选/改目录与文件名（服务端重算路径、越界回落、越权 400）
 *  → 批准后真移动 + 改名 + 一次 git commit + commit 回填 + tidy-log
 *  → 重复批准 400 / 驳回不写文件 / stale 跳过 / 脏工作区暂停后重试
 *  → 定时任务 proposal_scan 自动生成提案 / 无新文件只发说明
 *  → B3 原「整理新笔记」不受影响 → 真实库零接触 → 彻底清理
 *
 * 模型口径（用户 2026-11-20「能跑通就行」）：本脚本只保留 **1 次** 最小真实调用
 * 验证自然语言建议链路，其余全部用「已有合规标签」的 fixture 走纯规则、不调模型。
 * 若模型 429 / 不可用，如实标注 ai_failed，不用 mock 假装成功，也不算失败。
 *
 * 注意：只操作 D:\我的知识库测试；真实知识库零接触。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = process.cwd();
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? "./data");
const DB_FILE = path.join(DATA, "fold.sqlite");
const CFG_FILE = path.join(DATA, "scheduler.json");
const STATE_FILE = path.join(DATA, "scheduler-state.json");
const LOG_FILE = path.join(DATA, "tidy-log.json");
const TEST = "D:/我的知识库测试";
const REAL = "D:/我的知识库";
const INBOX = path.join(TEST, "未整理");
const SRC = `e2e-c2:${Date.now()}`;
const DIRMAP = { "course/": "课件和教材", "topic/": "笔记", "source/": "资源库", "type/": "笔记" };

let token = "";
let passed = 0, failed = 0, warned = 0;
let modelVerified = false;

function ok(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
function warn(name, why) { warned++; console.log(`  ⚠ ${name} —— ${why}`); }
async function api(p, options = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const post = (p, body) => api(p, { method: "POST", body: JSON.stringify(body) });
const patch = (p, body) => api(p, { method: "PATCH", body: JSON.stringify(body) });
const del = (p) => api(p, { method: "DELETE" });
const read = (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
function write(p, content) {
  if (content === null) { try { fs.unlinkSync(p); } catch {} }
  else fs.writeFileSync(p, content, "utf-8");
}
const md = (fm, body) => `${fm}\n${body}\n`;
function db() { return new Database(DB_FILE); }
function git(args) {
  try {
    return { ok: true, out: execFileSync("git", ["-C", TEST, ...args], { encoding: "utf-8", windowsHide: true }).trim() };
  } catch (e) { return { ok: false, out: String(e.stderr ?? e.message ?? "") }; }
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
// 真实库内含 develop/Fold_ 项目自身；.obsidian 是 Obsidian 常驻进程自己写的运行时状态
const SNAPSHOT_SKIP = new Set([
  ".git", "node_modules", ".next", "develop", "data",
  "data.e2e-backup-20261119", ".obsidian", ".trash", ".venv", "__pycache__",
]);
function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SNAPSHOT_SKIP.has(name)) continue;
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...allFiles(p));
    else out.push(`${p}|${st.mtimeMs}|${st.size}`);
  }
  return out;
}
const snapshot = (dir) => allFiles(dir).sort().join("\n");
function diffSnapshot(a, b) {
  const A = new Set(a.split("\n")), B = new Set(b.split("\n"));
  return `新增=${JSON.stringify([...B].filter((x) => !A.has(x)).slice(0, 4))} 消失=${JSON.stringify([...A].filter((x) => !B.has(x)).slice(0, 4))}`;
}
/** 删除文件/目录：Node 删不动（只读或批量删除保护）时回落 Windows 原生命令 */
function forceRemove(p) {
  let isDir = false;
  try { isDir = fs.statSync(p).isDirectory(); } catch { return; }
  try { fs.rmSync(p, { recursive: true, force: true }); if (!fs.existsSync(p)) return; } catch {}
  const win = p.replace(/\//g, "\\");
  try {
    if (isDir) execFileSync("cmd", ["/c", "rmdir", "/S", "/Q", win], { windowsHide: true });
    else execFileSync("cmd", ["/c", "del", "/F", "/Q", win], { windowsHide: true });
  } catch {}
}
function cleanVault() {
  if (!fs.existsSync(TEST)) return;
  for (const name of fs.readdirSync(TEST)) {
    if (name === ".git") continue;
    forceRemove(path.join(TEST, name));
  }
}
/** git 对象只读：先递归去只读再删，仍失败则系统强删回落（复用 e2e-reports 的 rmGit 思路） */
function killGit() {
  const dir = path.join(TEST, ".git");
  if (!fs.existsSync(dir)) return;
  const unreadonly = (d) => {
    let names = [];
    try { names = fs.readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = path.join(d, n);
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.isDirectory()) unreadonly(p);
      else { try { fs.chmodSync(p, 0o666); } catch {} }
    }
  };
  unreadonly(dir);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  if (fs.existsSync(dir)) forceRemove(dir);
}
function fixture(name, frontmatter) {
  const p = path.join(INBOX, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, frontmatter === null ? `# ${name}\n\n无 frontmatter 的弱标签笔记` : md(frontmatter, `# ${name}\n\n正文内容`), "utf-8");
  return p;
}
const STRONG_COURSE = '---\ntags: ["#course/微积分"]\ncreated: 2026-11-01\n---';
const STRONG_TOPIC = '---\ntags: ["#topic/极限"]\ncreated: 2026-11-02\n---';
const toSave = (items) => items.map((i) => ({
  from: i.from, dir: i.dir, filename: i.filename, title: i.title,
  tags: i.tags, enabled: i.enabled, ai_suggested: i.ai_suggested,
}));
async function genPreview() {
  const r = await post("/api/proposals", {});
  return r;
}
async function saveProposal(items, source = SRC) {
  return post("/api/proposals/save", { items: toSave(items), source, ai_used: false, ai_failed: null });
}

async function main() {
  console.log(`审批闸门端到端验收 ${BASE}`);

  // ---------- 0) 未登录 ----------
  ok("未登录 GET /api/proposals → 401", (await api("/api/proposals")).status === 401);
  ok("未登录 POST /api/proposals → 401", (await genPreview()).status === 401);
  ok("未登录 POST /api/proposals/save → 401", (await saveProposal([])).status === 401);
  ok("未登录 GET /api/proposals/:id → 401", (await api("/api/proposals/no-such-id")).status === 401);
  ok("未登录 POST /api/proposals/:id/approve → 401", (await post("/api/proposals/no-such-id/approve", {})).status === 401);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  token = (await login.json()).token ?? "";
  ok("登录拿到 token", login.status === 200 && token.length > 0);

  // ---------- 1) 备份 + 基线 ----------
  const lib0 = await api("/api/libraries");
  const originalLib = lib0.data.config;
  ok("GET /api/libraries → 200", lib0.status === 200 && Boolean(originalLib));
  const sch0 = await api("/api/scheduler");
  const originalTasks = sch0.data.config?.tasks ?? [];
  ok("GET /api/scheduler → 200", sch0.status === 200 && Array.isArray(originalTasks));
  const cfgBackup = read(CFG_FILE), stateBackup = read(STATE_FILE), logBackup = read(LOG_FILE);

  const d0 = db();
  const initialIds = new Set(d0.prepare("SELECT id FROM items WHERE type IN ('proposal','message')").all().map((r) => r.id));
  const initialProposals = (await api("/api/proposals")).data.proposals?.length ?? 0;
  const initialMessages = (await api("/api/messages")).data.messages?.length ?? 0;
  d0.close();

  const libBase = await api("/api/libraries", {
    method: "PUT",
    body: JSON.stringify(cfgBody(originalLib, {
      inboxDir: INBOX.replace(/\//g, "\\"),
      dirMap: DIRMAP,
      tidy: { move: true, rename: true, tag: false },
    })),
  });
  ok("PUT 基线配置 → 200", libBase.status === 200, JSON.stringify(libBase.data).slice(0, 160));
  ok("基线：移动✓ 重命名✓ 打标签✗", libBase.data.config?.tidy?.move === true && libBase.data.config?.tidy?.rename === true && libBase.data.config?.tidy?.tag === false);
  ok("基线：inboxDir 指向测试库未整理", String(libBase.data.config?.inboxDir ?? "").includes("我的知识库测试"));

  // 把所有定时任务停用，避免 cron 自动 tick（默认 09:00 proposal_scan）在验收中途生成提案/调模型
  const disabled = originalTasks.map((t) => ({
    id: t.id, name: t.name, job: t.job, enabled: false, schedule: t.schedule,
  }));
  const schPut = await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: disabled }) });
  ok("停用全部定时任务（隔离 cron 干扰）→ 200", schPut.status === 200, JSON.stringify(schPut.data).slice(0, 160));
  ok("jobs 目录含 4 项（C2 新增 proposal_scan）", (sch0.data.jobs ?? []).length === 4, JSON.stringify((sch0.data.jobs ?? []).map((j) => j.id)));
  ok("默认任务含 proposal_scan", originalTasks.some((t) => t.job === "proposal_scan"));

  const realBefore = snapshot(REAL);

  // 清场：从「无 git 仓库 + 空测试库」开始
  killGit();
  cleanVault();
  fs.mkdirSync(INBOX, { recursive: true });

  // ---------- 2) 纯规则预览（不调模型、不落库） ----------
  const fC1 = fixture("c1.md", STRONG_COURSE);
  const fC2 = fixture("c2.md", STRONG_TOPIC);
  const filesBefore = allFiles(TEST).sort().join("|");

  const pv = await genPreview();
  ok("POST /api/proposals → 200", pv.status === 200, JSON.stringify(pv.data).slice(0, 200));
  const preview = pv.data.preview;
  ok("预览返回 counts 三元组", Boolean(preview?.counts) && typeof preview.counts.candidates === "number");
  ok("合规标签 → 弱标签 0 个，本次不调模型", preview?.counts?.weak === 0 && preview?.ai_used === false, JSON.stringify(preview?.counts));
  ok("候选 2 个", preview?.counts?.candidates === 2, String(preview?.counts?.candidates));
  const itemC1 = (preview?.items ?? []).find((i) => i.from.endsWith("c1.md"));
  const itemC2 = (preview?.items ?? []).find((i) => i.from.endsWith("c2.md"));
  ok("course 标签 → 课件和教材 目录", itemC1?.dir === "课件和教材", JSON.stringify(itemC1?.dir));
  ok("topic 标签 → 笔记 目录", itemC2?.dir === "笔记", JSON.stringify(itemC2?.dir));
  ok("合规标签条目全部走规则（ai_suggested=false）", (preview?.items ?? []).every((i) => i.ai_suggested === false));
  ok("文件名带 YYYY-MM-DD_ 前缀", /^\d{4}-\d{2}-\d{2}_/.test(itemC1?.filename ?? ""), String(itemC1?.filename));
  ok("预览不落库（提案数不变）", (await api("/api/proposals")).data.proposals?.length === initialProposals);
  ok("预览不写文件", allFiles(TEST).sort().join("|") === filesBefore);
  ok("预览不 init git", !fs.existsSync(path.join(TEST, ".git")));
  ok("预览返回 root 落在测试库", String(preview?.root ?? "").includes("我的知识库测试"), String(preview?.root));

  // ---------- 3) 1 次最小真实模型调用（只补弱标签） ----------
  const fWeak = fixture("weak1.md", null);
  const weakContent = read(fWeak);
  const pvWeak = await genPreview();
  ok("POST /api/proposals（含弱标签）→ 200", pvWeak.status === 200, JSON.stringify(pvWeak.data).slice(0, 200));
  const pvw = pvWeak.data.preview;
  ok("检测到弱标签文件", (pvw?.counts?.weak ?? 0) >= 1, JSON.stringify(pvw?.counts));
  const modelTouched = pvw?.ai_used === true || typeof pvw?.ai_failed === "string";
  ok("模型链路被走到：成功或如实标注失败（不假装成功）", modelTouched,
    `ai_used=${pvw?.ai_used} ai_failed=${pvw?.ai_failed}`);
  modelVerified = pvw?.ai_used === true;
  if (pvw?.ai_failed) warn("真实模型调用", `模型不可用，已如实降级为纯规则提案：${String(pvw.ai_failed).slice(0, 120)}`);
  ok("AI 建议不写 frontmatter / 不改正文", read(fWeak) === weakContent);
  if (pvw?.ai_used) {
    const w = (pvw.items ?? []).find((i) => i.from.endsWith("weak1.md"));
    ok("AI 建议的标签带合规层级前缀（用于推算目录）",
      Boolean(w) && (w.tags ?? []).some((t) => /^(course|topic|source|type)\//.test(t)), JSON.stringify(w?.tags));
    ok("AI 建议条目标记 ai_suggested=true", w?.ai_suggested === true);
  } else {
    warn("AI 建议生效断言", "模型未真正生效，跳过该断言，链路已如实标注");
  }
  // 删掉弱标签 fixture，后续所有场景只留合规标签 → 不再产生真实模型调用
  try { fs.rmSync(fWeak, { force: true }); } catch {}

  // ---------- 4) 保存为提案并通知 ----------
  const saved = await saveProposal(preview.items);
  ok("POST /api/proposals/save → 200", saved.status === 200, JSON.stringify(saved.data).slice(0, 200));
  const prop = saved.data.proposal;
  ok("保存返回待审批提案", Boolean(prop) && prop.status === "pending", JSON.stringify(prop?.status));
  ok("提案条目数 = 2", prop?.items?.length === 2, String(prop?.items?.length));
  ok("提案 source 为本次脚本标记", prop?.source === SRC, String(prop?.source));
  ok("pending 计数 +1", saved.data.pending === initialProposals + 1 || (await api("/api/proposals")).data.pending >= 1,
    String(saved.data.pending));
  const msgs1 = (await api("/api/messages")).data.messages ?? [];
  const propMsg = msgs1.find((m) => m.source === `proposal:${prop.id}`);
  ok("保存后新增一条 kind=proposal 站内消息", Boolean(propMsg) && propMsg.kind === "proposal", JSON.stringify(propMsg?.kind));
  ok("站内消息正文写明「批准后才动文件」", /批准/.test(propMsg?.body ?? ""), String(propMsg?.body).slice(0, 100));
  ok("消息未读", propMsg?.read === false);
  const got = await api(`/api/proposals/${encodeURIComponent(prop.id)}`);
  ok("GET /api/proposals/:id → 200", got.status === 200 && got.data.proposal?.id === prop.id);
  ok("GET /api/proposals?status=pending 含该提案", (await api("/api/proposals?status=pending")).data.proposals?.some((p) => p.id === prop.id));
  ok("不存在的提案 → 404", (await api("/api/proposals/no-such-id")).status === 404);

  // ---------- 5) 同文件去重 ----------
  const dup = await saveProposal(preview.items, `${SRC}-dup`);
  ok("重复保存 → duplicated=true 且不新建提案", dup.status === 200 && dup.data.duplicated === true && dup.data.proposal === null,
    JSON.stringify(dup.data).slice(0, 160));
  const msgs2 = (await api("/api/messages")).data.messages ?? [];
  ok("去重不重复发站内消息", msgs2.length === msgs1.length, `${msgs1.length} → ${msgs2.length}`);

  // ---------- 6) 逐条编辑 / 路径服务端重算 / 越权 ----------
  const edited = prop.items.map((it, idx) => idx === 0
    ? { ...it, dir: "资源库", filename: "自定义_极限.md", enabled: true }
    : { ...it, enabled: false });
  const pEdit = await patch(`/api/proposals/${encodeURIComponent(prop.id)}`, { items: toSave(edited) });
  ok("PATCH 逐条编辑 → 200", pEdit.status === 200, JSON.stringify(pEdit.data).slice(0, 200));
  const e0 = pEdit.data.proposal?.items?.[0];
  ok("改目录生效：资源库", e0?.dir === "资源库", String(e0?.dir));
  ok("改文件名为服务端规范化（补日期前缀 + .md）",
    /^\d{4}-\d{2}-\d{2}_自定义_极限\.md$/.test(e0?.filename ?? ""), String(e0?.filename));
  ok("to 由服务端按 dir+filename 重算，未信任客户端", String(e0?.to ?? "").includes("资源库") && String(e0?.to ?? "").includes("自定义_极限"), String(e0?.to));
  ok("to 仍在测试知识库根内", String(e0?.to ?? "").replace(/\\/g, "/").toLowerCase().startsWith(TEST.toLowerCase()));
  ok("第 2 条已取消勾选", pEdit.data.proposal?.items?.[1]?.enabled === false);

  const pBadDir = await patch(`/api/proposals/${encodeURIComponent(prop.id)}`, {
    items: toSave(edited.map((it, idx) => idx === 0 ? { ...it, dir: "../../evil" } : it)),
  });
  ok("越界 dir 回落到「笔记」而非穿越", pBadDir.status === 200 && pBadDir.data.proposal?.items?.[0]?.dir === "笔记",
    String(pBadDir.data.proposal?.items?.[0]?.dir));
  ok("回落后的 to 未越出测试库", String(pBadDir.data.proposal?.items?.[0]?.to ?? "").replace(/\\/g, "/").toLowerCase().startsWith(TEST.toLowerCase()));

  const pBadStatus = await patch(`/api/proposals/${encodeURIComponent(prop.id)}`, { status: "approved" });
  ok("非法 PATCH（status 非 rejected）→ 400", pBadStatus.status === 400);
  const pBadFrom = await post("/api/proposals/save", {
    items: [{ from: "D:\\我的知识库\\未整理\\evil.md", dir: "笔记", filename: "x.md", title: "x", tags: [], enabled: true }],
    source: `${SRC}-evil`,
  });
  ok("越权 from（指向真实库）→ 400", pBadFrom.status === 400 && /未整理目录/.test(pBadFrom.data.error ?? ""), JSON.stringify(pBadFrom.data));

  // 把编辑改回预期状态再批准
  await patch(`/api/proposals/${encodeURIComponent(prop.id)}`, { items: toSave(edited) });

  // ---------- 7) 批准执行：真移动 + 一次 commit ----------
  const appr = await post(`/api/proposals/${encodeURIComponent(prop.id)}/approve`, {});
  ok("POST /api/proposals/:id/approve → 200", appr.status === 200, JSON.stringify(appr.data).slice(0, 240));
  const res = appr.data.result;
  ok("result.commit 非空且 count=1", Boolean(res?.commit) && res?.count === 1, JSON.stringify({ commit: res?.commit, count: res?.count }));
  ok("result.message 标明审批提案", /审批提案/.test(res?.message ?? ""), String(res?.message));
  ok("勾选条目原文件已移走", !fs.existsSync(fC1));
  ok("勾选条目落到 资源库/自定义_极限.md", fs.existsSync(path.join(TEST, "资源库", e0.filename)));
  ok("未勾选条目保持原样（不擅自整理）", fs.existsSync(fC2));
  ok("执行后测试库出现 .git", fs.existsSync(path.join(TEST, ".git")));
  ok("只做一次 git commit", git(["rev-list", "--count", "HEAD"]).out === "1", String(git(["rev-list", "--count", "HEAD"]).out));
  ok("提案 status=approved 且回填 commit", appr.data.proposal?.status === "approved" && appr.data.proposal?.commit === res.commit,
    JSON.stringify({ status: appr.data.proposal?.status, commit: appr.data.proposal?.commit }));
  ok("tidy-log.json 记录本次审批提案", (read(LOG_FILE) ?? "").includes("审批提案"));
  const appr2 = await post(`/api/proposals/${encodeURIComponent(prop.id)}/approve`, {});
  ok("重复批准 → 400（提案保持已处理）", appr2.status === 400);

  // ---------- 8) 驳回不写任何文件 ----------
  try { fs.rmSync(fC2, { force: true }); } catch {}
  const fR1 = fixture("r1.md", STRONG_COURSE);
  const pvR = (await genPreview()).data.preview;
  const savedR = (await saveProposal(pvR.items, `${SRC}-reject`)).data.proposal;
  ok("驳回场景：提案已保存", Boolean(savedR));
  const rej = await patch(`/api/proposals/${encodeURIComponent(savedR.id)}`, { status: "rejected" });
  ok("PATCH 驳回 → 200 且 status=rejected", rej.status === 200 && rej.data.proposal?.status === "rejected");
  ok("驳回不写文件（原文件仍在未整理）", fs.existsSync(fR1));
  ok("驳回不留 commit / decided_at 有值", rej.data.proposal?.commit === null && Boolean(rej.data.proposal?.decided_at));
  try { fs.rmSync(fR1, { force: true }); } catch {}

  // ---------- 9) stale 跳过 ----------
  const fS1 = fixture("s1.md", STRONG_COURSE);
  const fS2 = fixture("s2.md", STRONG_TOPIC);
  const pvS = (await genPreview()).data.preview;
  const savedS = (await saveProposal(pvS.items, `${SRC}-stale`)).data.proposal;
  ok("stale 场景：提案含 2 个条目", savedS?.items?.length === 2, String(savedS?.items?.length));
  try { fs.rmSync(fS2, { force: true }); } catch {}   // 模拟文件已被别处整理/移走
  const apprS = await post(`/api/proposals/${encodeURIComponent(savedS.id)}/approve`, {});
  ok("部分 stale 时仍能批准（不因个别失效整体失败）", apprS.status === 200, JSON.stringify(apprS.data).slice(0, 200));
  ok("只移动仍存在的 1 个文件", apprS.data.result?.count === 1, String(apprS.data.result?.count));
  ok("stale 条目被写回跳过原因", (apprS.data.proposal?.items ?? []).some((i) => /不存在|已移走/.test(i.reason ?? "")),
    JSON.stringify((apprS.data.proposal?.items ?? []).map((i) => i.reason)));

  // ---------- 10) 脏工作区暂停 → 清理后可重试 ----------
  const dirtyMarker = path.join(TEST, "dirty-marker.txt");
  fs.writeFileSync(dirtyMarker, "外部改动", "utf-8");
  const fD1 = fixture("d1.md", STRONG_COURSE);
  const pvD = (await genPreview()).data.preview;
  const savedD = (await saveProposal(pvD.items, `${SRC}-dirty`)).data.proposal;
  const block = await post(`/api/proposals/${encodeURIComponent(savedD.id)}/approve`, {});
  ok("脏工作区 → 批准 400 并说明未提交改动", block.status === 400 && /未提交改动/.test(block.data.error ?? ""), JSON.stringify(block.data));
  ok("被暂停的提案保持 pending 可重试", (await api(`/api/proposals/${encodeURIComponent(savedD.id)}`)).data.proposal?.status === "pending");
  ok("被暂停时未动文件", fs.existsSync(fD1));
  try { fs.rmSync(dirtyMarker, { force: true }); } catch {}
  const retry = await post(`/api/proposals/${encodeURIComponent(savedD.id)}/approve`, {});
  ok("清理脏改动后重试批准 → 200", retry.status === 200, JSON.stringify(retry.data).slice(0, 200));

  // ---------- 11) B3 原「整理新笔记」不受影响 ----------
  const fB1 = fixture("b1.md", STRONG_TOPIC);
  const tidyStatus = await api("/api/tidy");
  ok("B3 GET /api/tidy → 200", tidyStatus.status === 200, JSON.stringify(tidyStatus.data).slice(0, 160));
  const tidyPv = await post("/api/tidy/preview", {});
  ok("B3 POST /api/tidy/preview → 200", tidyPv.status === 200);
  const tidyRun = await post("/api/tidy/run", {});
  ok("B3 POST /api/tidy/run → 200（C2 未破坏原执行引擎）", tidyRun.status === 200, JSON.stringify(tidyRun.data).slice(0, 200));
  ok("B3 仍真的移动了文件", (tidyRun.data.result?.count ?? 0) >= 1 && !fs.existsSync(fB1));

  // ---------- 12) 定时任务 proposal_scan ----------
  const fP1 = fixture("p1.md", STRONG_COURSE);
  let scanTask = originalTasks.find((t) => t.job === "proposal_scan");
  ok("配置含 proposal_scan 默认任务（C1 老配置已自动补齐）", Boolean(scanTask),
    JSON.stringify(originalTasks.map((t) => t.job)));
  if (!scanTask) {
    // 防御：环境里若确实删掉了默认任务，临时补一个来验链路（收尾会恢复原配置）
    scanTask = { id: "e2e-proposal-scan", name: "验收用生成整理提案", job: "proposal_scan",
      enabled: false, schedule: { kind: "daily", time: "23:57" } };
    await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: [...disabled, scanTask] }) });
  }
  const run1 = await post("/api/scheduler/run", { task_id: scanTask.id });
  ok("手动运行 proposal_scan → 200", run1.status === 200, JSON.stringify(run1.data).slice(0, 200));
  ok("定时任务产出 kind=proposal 站内消息", run1.data.message?.kind === "proposal", String(run1.data.message?.kind));
  ok("定时返回的是提案通知消息（source=proposal:<提案id>）",
    /^proposal:/.test(run1.data.message?.source ?? ""), String(run1.data.message?.source));
  const scanProp = (await api("/api/proposals")).data.proposals?.find((p) => /^manual:.*proposal-scan/.test(p.source ?? ""));
  ok("定时任务自动落库提案（source=manual:job-proposal-scan）", Boolean(scanProp), JSON.stringify((await api("/api/proposals")).data.proposals?.map((p) => p.source)).slice(0, 200));
  ok("定时生成的提案仍是 pending（不自动执行）", scanProp?.status === "pending");
  const run2 = await post("/api/scheduler/run", { task_id: scanTask.id });
  ok("无新文件时只发 system 说明、不重复提案", run2.status === 200 && run2.data.message?.kind === "system", String(run2.data.message?.kind));
  ok("定时任务全程零接触模型（合规标签不走 AI）", (await genPreview()).data.preview?.ai_used === false);

  // ---------- 13) 软删除 ----------
  const delRes = await del(`/api/proposals/${encodeURIComponent(savedR.id)}`);
  ok("DELETE /api/proposals/:id → 200", delRes.status === 200, JSON.stringify(delRes.data));
  ok("软删除后 GET → 404", (await api(`/api/proposals/${encodeURIComponent(savedR.id)}`)).status === 404);
  ok("软删除后不在列表里", !(await api("/api/proposals")).data.proposals?.some((p) => p.id === savedR.id));

  warn("占用文件跳过", "C2 复用 B3 executeTidy 的 isLocked() 跳过逻辑，已在 e2e-tidy.mjs 覆盖；Windows 写锁难稳定模拟，本脚本不重复造");

  // ---------- 14) 真实库零接触 ----------
  const realAfter = snapshot(REAL);
  ok("真实知识库零接触（文件 + mtime + size 快照一致）", realAfter === realBefore, diffSnapshot(realBefore, realAfter));
  const allProps = (await api("/api/proposals")).data.proposals ?? [];
  ok("所有提案的 root 都在测试知识库内", allProps.every((p) => String(p.root ?? "").replace(/\\/g, "/").toLowerCase().startsWith(TEST.toLowerCase())));

  // ---------- 15) 收尾：恢复配置 + 彻底清理 ----------
  await api("/api/libraries", { method: "PUT", body: JSON.stringify(cfgBody(originalLib)) });
  await api("/api/scheduler", { method: "PUT", body: JSON.stringify({ tasks: originalTasks.map((t) => ({
    id: t.id, name: t.name, job: t.job, enabled: t.enabled, schedule: t.schedule,
  })) }) });
  write(CFG_FILE, cfgBackup);
  write(STATE_FILE, stateBackup);
  write(LOG_FILE, logBackup);

  const dc = db();
  const rows = dc.prepare("SELECT id FROM items WHERE type IN ('proposal','message')").all();
  const toDelete = rows.map((r) => r.id).filter((id) => !initialIds.has(id));
  if (toDelete.length) {
    dc.prepare(`DELETE FROM items WHERE id IN (${toDelete.map(() => "?").join(",")})`).run(...toDelete);
  }
  const remainP = (dc.prepare("SELECT id FROM items WHERE type = 'proposal'").all()).length;
  const remainM = (dc.prepare("SELECT id FROM items WHERE type = 'message'").all()).length;
  dc.close();
  ok("本轮提案/消息已从主库彻底清理", (await api("/api/proposals")).data.proposals?.length === initialProposals
    && (await api("/api/messages")).data.messages?.length === initialMessages,
    `proposals=${remainP} messages=${remainM}`);
  killGit();
  cleanVault();
  ok("测试知识库已恢复到干净状态", !fs.existsSync(path.join(TEST, ".git")) && allFiles(TEST).length === 0,
    `残留 ${allFiles(TEST).length} 个文件`);
  ok("清理后提案接口正常", (await api("/api/proposals")).status === 200);

  console.log(`\n结果：${passed} 通过，${failed} 失败，${warned} 说明`);
  console.log(`真实模型建议链路：${modelVerified ? "已验证（1 次最小调用）" : "未验证（模型不可用，已如实标注 ai_failed）"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("脚本异常：", e); process.exit(1); });
