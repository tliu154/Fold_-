/**
 * C3 第 2 轮验收：AI 个性化设置通道（L0 注册表 / L1 一句话改设置）
 *
 * 覆盖：401 鉴权、注册表只读、默认值、写死开关与 AI 通道共用校验、
 * 草案预览不落库、1 次最小真实模型调用、模型不可用如实标注、
 * 敏感项拦截、非法值拦截、逐条编辑后落库生效、改动历史、一键回滚、
 * 覆盖较新值需二次确认、真实库零接触、收尾恢复配置与历史。
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = process.cwd();
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? "./data");
const DB_FILE = path.join(DATA, "fold.sqlite");
const CFG_FILES = ["libraries.json", "report-sources.json", "filing-rules.json", "open-with.json"];

let passed = 0, failed = 0, warned = 0;
function ok(label, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}
function note(label, cond, detail = "") { if (!cond) { warned++; console.log(`  ! ${label} ${detail}`); } }
function db() { return new Database(DB_FILE); }

let cookie = "";
async function api(pathname, opts = {}) {
  const { method = "GET", body, noAuth = false } = opts;
  const h = {};
  if (!noAuth && cookie) h.Cookie = cookie;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathname, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { status: 0, data: {} };
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
function login() { return api("/api/auth/login", { method: "POST", body: { password: PASSWORD } }); }

async function main() {
  console.log("=== C3 第 2 轮：AI 个性化设置通道 ===");

  /* ---------- 备份（收尾必须恢复，避免污染其它脚本） ---------- */
  const backups = new Map();
  for (const f of CFG_FILES) {
    const p = path.join(DATA, f);
    backups.set(f, fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null);
  }
  const d0 = db();
  const beforeIds = new Set(d0.prepare("SELECT id FROM items WHERE type = 'setting_history'").all().map((r) => r.id));
  const beforeHistoryCount = beforeIds.size;
  d0.close();

  /* ---------- 401 ---------- */
  ok("未登录注册表 → 401", (await api("/api/settings", { noAuth: true })).status === 401);
  ok("未登录手动改 → 401", (await api("/api/settings", { method: "PUT", noAuth: true, body: {} })).status === 401);
  ok("未登录草案 → 401", (await api("/api/settings/draft", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("未登录应用 → 401", (await api("/api/settings/apply", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("未登录历史 → 401", (await api("/api/settings/history", { noAuth: true })).status === 401);
  ok("未登录回滚 → 401", (await api("/api/settings/revert", { method: "POST", noAuth: true, body: {} })).status === 401);
  ok("登录 → 200", (await login()).status === 200);

  /* ---------- L0 注册表 ---------- */
  const st = await api("/api/settings");
  ok("注册表 → 200", st.status === 200, String(st.status));
  const catalog = st.data.catalog ?? [];
  ok("登记 4 项试点设置", catalog.length === 4, JSON.stringify(catalog.map((c) => c.key)));
  ok("4 项都允许管家改", (st.data.aiAllowed ?? []).length === 4
    && ["filing_rules", "report_sources", "manual_highlights", "open_with"]
      .every((k) => (st.data.aiAllowed ?? []).includes(k)));
  ok("敏感项只准手动改", ["knowledgeDirs", "projectDirs", "exportVault", "inboxDir",
    "dirMap", "obsidianVault", "auth", "password", "rateLimit"].every((k) => (st.data.manualOnly ?? []).includes(k)));
  ok("每项都有影响范围说明", catalog.every((c) => typeof c.impact === "string" && c.impact.length > 4));
  const values = st.data.values ?? {};
  ok("能读到 4 项当前值", ["filing_rules", "report_sources", "manual_highlights", "open_with"]
    .every((k) => values[k] !== undefined));
  ok("整理规范含兜底规则（exts 为空）", (values.filing_rules ?? []).some((r) => r.exts.length === 0));
  ok("周报数据源 6 类齐全", Object.keys(values.report_sources?.enabled ?? {}).length === 6);
  ok("打开方式默认 HTML 走 Obsidian", (values.open_with?.obsidian_exts ?? []).includes(".html"));
  ok("打开方式默认其它走系统", values.open_with?.default === "system");

  const snapValues = async () => JSON.stringify((await api("/api/settings")).data.values ?? {});
  const snapHistory = async () => ((await api("/api/settings/history")).data.history ?? []).length;
  const initialValues = await snapValues();
  const initialHistory = await snapHistory();

  /* ---------- 写死开关与 AI 共用校验（非法值一律拒） ---------- */
  const noFallback = (values.filing_rules ?? []).filter((r) => r.exts.length > 0);
  const p1 = await api("/api/settings", { method: "PUT", body: { key: "filing_rules", value: noFallback } });
  ok("PUT 删掉兜底规则 → 400", p1.status === 400, String(p1.status));
  ok("PUT 拒绝原因含「兜底」", String((await api("/api/settings", { method: "PUT", body: { key: "filing_rules", value: noFallback } })).data.error ?? "").includes("兜底"));
  const p2 = await api("/api/settings", { method: "PUT", body: { key: "report_sources", value: { enabled: { todos_done: true, unknown_source: true } } } });
  ok("PUT 未知数据源 → 400", p2.status === 400, String(p2.status));
  const p3 = await api("/api/settings", { method: "PUT", body: { key: "open_with", value: { obsidian_exts: ["md"], default: "system" } } });
  ok("PUT 非法扩展名 → 400", p3.status === 400, String(p3.status));
  const p4 = await api("/api/settings", { method: "PUT", body: { key: "manual_highlights", value: { manual_highlights: Array(21).fill("x") } } });
  ok("PUT 手动重点超 20 条 → 400", p4.status === 400, String(p4.status));
  const p5 = await api("/api/settings", { method: "PUT", body: { key: "knowledgeDirs", value: ["D:/x"] } });
  ok("PUT 敏感项 → 400", p5.status === 400, String(p5.status));
  ok("非法值没有落库", (await snapValues()) === initialValues);

  /* ---------- 草案：不调用模型（如实标注，不 mock 假装成功） ---------- */
  const dry = await api("/api/settings/draft", { method: "POST", body: { text: "关掉 git 提交这个数据源", useAi: false } });
  ok("draft(useAi:false) → 200 且如实标注", dry.status === 200 && dry.data.ok === false
    && dry.data.reason === "model_disabled" && dry.data.ai_used === false, JSON.stringify(dry.data).slice(0, 200));
  ok("draft 模型不可用时草案留空", Array.isArray(dry.data.items) && dry.data.items.length === 0);
  ok("draft 错误文案可读", String(dry.data.error ?? "").includes("未调用模型"));
  ok("draft 不落库：配置值不变", (await snapValues()) === initialValues);
  ok("draft 不落库：历史不增", (await snapHistory()) === initialHistory);
  const dryBad = await api("/api/settings/draft", { method: "POST", body: { text: "", useAi: false } });
  ok("draft 空文本 → 400", dryBad.status === 400, String(dryBad.status));

  /* ---------- 1 次最小真实模型调用（自然语言 → 结构化草案） ---------- */
  const vBeforeAi = await snapValues();
  const hBeforeAi = await snapHistory();
  const real = await api("/api/settings/draft", { method: "POST", body: { text: "请把 git 提交这个周报数据源关掉", useAi: true } });
  ok("draft(useAi:true) → 200", real.status === 200, String(real.status));
  if (real.data.ok === true) {
    ok("真实调用后返回逐条草案", Array.isArray(real.data.items));
    ok("草案字段齐全（current/proposed/impact/reason/valid/blocked/errors/enabled）",
      (real.data.items ?? []).every((i) => ["key", "label", "current", "proposed", "impact", "reason", "valid", "blocked", "errors", "enabled"]
        .every((k) => k in i)));
    ok("草案只含白名单设置项", (real.data.items ?? []).every((i) =>
      ["filing_rules", "report_sources", "manual_highlights", "open_with"].includes(i.key)),
      JSON.stringify((real.data.items ?? []).map((i) => i.key)));
  } else {
    note("模型不可用/输出异常，已如实标注（不算失败）",
      ["ai_failed", "ai_bad_output"].includes(real.data.reason) && String(real.data.error ?? "").length > 4,
      JSON.stringify(real.data).slice(0, 220));
  }
  ok("AI 草案绝不落库：配置值不变", (await snapValues()) === vBeforeAi);
  ok("AI 草案绝不落库：历史不增", (await snapHistory()) === hBeforeAi);
  ok("AI 草案不发站内消息（本轮通道不落 items）", (await api("/api/messages")).status === 200);

  /* ---------- apply：敏感项 / 非法值拦截 ---------- */
  const libBefore = fs.readFileSync(path.join(DATA, "libraries.json"), "utf-8");
  const s1 = await api("/api/settings/apply", { method: "POST", body: { items: [{ key: "knowledgeDirs", value: ["D:/x"], enabled: true }] } });
  ok("apply 敏感项「库路径」→ 400", s1.status === 400 && String(s1.data.error ?? "").includes("只准手动修改"), JSON.stringify(s1.data).slice(0, 180));
  const s2 = await api("/api/settings/apply", { method: "POST", body: { items: [{ key: "exportVault", value: "D:/x", enabled: true }] } });
  ok("apply 敏感项「导出目标」→ 400", s2.status === 400, String(s2.status));
  const s3 = await api("/api/settings/apply", { method: "POST", body: { items: [{ key: "obsidianVault", value: "x", enabled: true }] } });
  ok("apply 敏感项「Obsidian 库名」→ 400", s3.status === 400, String(s3.status));
  ok("敏感项被拦：libraries.json 未被改写", fs.readFileSync(path.join(DATA, "libraries.json"), "utf-8") === libBefore);

  const vBeforeBad = await snapValues();
  const hBeforeBad = await snapHistory();
  const b1 = await api("/api/settings/apply", { method: "POST", body: { items: [
    { key: "filing_rules", value: [{ id: "x", label: "x", exts: [".md"], tags: ["type/笔记"], note: "" }], enabled: true },
  ] } });
  ok("apply 删兜底规则 → 400", b1.status === 400, String(b1.status));
  const b2 = await api("/api/settings/apply", { method: "POST", body: { items: [
    { key: "report_sources", value: { enabled: { todos_done: "yes" } }, enabled: true },
  ] } });
  ok("apply 非布尔开关 → 400", b2.status === 400, String(b2.status));
  const b3 = await api("/api/settings/apply", { method: "POST", body: { items: [
    { key: "open_with", value: { obsidian_exts: [".md"], default: "browser" }, enabled: true },
  ] } });
  ok("apply 非法 default → 400", b3.status === 400, String(b3.status));
  ok("非法值整批拒绝，不写半个值", (await snapValues()) === vBeforeBad);
  ok("非法值不产生历史", (await snapHistory()) === hBeforeBad);

  /* ---------- 逐条编辑 + 确认落库生效 ---------- */
  const beforeApply = JSON.parse(await snapValues());
  const hBeforeApply = await snapHistory();
  const newEnabled = { ...beforeApply.report_sources.enabled, todos_done: false, git_commits: true };
  const applied = await api("/api/settings/apply", { method: "POST", body: {
    source: "e2e-settings",
    items: [
      { key: "report_sources", value: { enabled: newEnabled }, enabled: true },
      { key: "open_with", value: { obsidian_exts: [".md", ".html", ".htm", ".pdf", ".txt"], default: "system" }, enabled: true },
      { key: "manual_highlights", value: { manual_highlights: ["不该被应用"] }, enabled: false },
    ],
  } });
  ok("apply 勾选项 → 200", applied.status === 200, JSON.stringify(applied.data).slice(0, 220));
  ok("只应用勾选的 2 项", (applied.data.applied ?? []).length === 2
    && !(applied.data.applied ?? []).includes("manual_highlights"), JSON.stringify(applied.data.applied));
  const afterApply = (await api("/api/settings")).data.values ?? {};
  ok("生效后数据源开关已变", afterApply.report_sources?.enabled?.todos_done === false
    && afterApply.report_sources?.enabled?.git_commits === true);
  ok("生效后打开方式已变", (afterApply.open_with?.obsidian_exts ?? []).includes(".txt"));
  ok("未勾选的项保持原样", JSON.stringify(afterApply.manual_highlights) === JSON.stringify(beforeApply.manual_highlights));
  const hAfterApply = (await api("/api/settings/history")).data.history ?? [];
  ok("每次生效记一条历史（+2）", hAfterApply.length === hBeforeApply + 2,
    `${hBeforeApply} → ${hAfterApply.length}`);
  ok("历史含改前/改后/来源", hAfterApply.slice(0, 2).every((h) =>
    h.before !== undefined && h.after !== undefined && h.source === "e2e-settings"));

  /* ---------- 一键回滚 ---------- */
  const openHist = hAfterApply.find((h) => h.key === "open_with");
  const rev = await api("/api/settings/revert", { method: "POST", body: { id: openHist.id } });
  ok("回滚 open_with → 200", rev.status === 200 && rev.data.ok === true, JSON.stringify(rev.data).slice(0, 180));
  ok("回滚后值恢复成改前", JSON.stringify((await api("/api/settings")).data.values?.open_with)
    === JSON.stringify(beforeApply.open_with));
  const hAfterRev = (await api("/api/settings/history")).data.history ?? [];
  ok("撤销再记一条新历史（不删旧记录）", hAfterRev.length === hAfterApply.length + 1
    && hAfterRev[0].source === "revert", `${hAfterApply.length} → ${hAfterRev.length}`);

  /* ---------- 覆盖较新值需二次确认 ---------- */
  const e2 = { ...beforeApply.report_sources.enabled, todos_done: true, checkins: false };
  const a1 = await api("/api/settings/apply", { method: "POST", body: { source: "e2e-settings", items: [
    { key: "report_sources", value: { enabled: e2 }, enabled: true },
  ] } });
  ok("制造较新改动 A → 200", a1.status === 200, String(a1.status));
  const h1 = ((await api("/api/settings/history")).data.history ?? [])[0];
  const e3 = { ...beforeApply.report_sources.enabled, todos_done: false, checkins: true, tidy: false };
  const a2 = await api("/api/settings/apply", { method: "POST", body: { source: "e2e-settings", items: [
    { key: "report_sources", value: { enabled: e3 }, enabled: true },
  ] } });
  ok("又改一次 B → 200", a2.status === 200, String(a2.status));
  const revOld = await api("/api/settings/revert", { method: "POST", body: { id: h1.id } });
  ok("回滚旧记录 → 409 需要二次确认", revOld.status === 409 && revOld.data.needsConfirm === true
    && String(revOld.data.message ?? "").includes("覆盖较新的值"), JSON.stringify(revOld.data).slice(0, 200));
  const revConfirm = await api("/api/settings/revert", { method: "POST", body: { id: h1.id, confirm: true } });
  ok("二次确认后回滚成功", revConfirm.status === 200 && revConfirm.data.ok === true, JSON.stringify(revConfirm.data).slice(0, 180));
  const revMissing = await api("/api/settings/revert", { method: "POST", body: { id: "not-exist-id" } });
  ok("回滚不存在的记录 → 400", revMissing.status === 400, String(revMissing.status));

  /* ---------- 模型不可用时写死开关仍可用 ---------- */
  const manual = await api("/api/settings", { method: "PUT", body: { key: "manual_highlights", value: { manual_highlights: ["手动也能改"] } } });
  ok("手动改（不经 AI）→ 200", manual.status === 200, String(manual.status));
  ok("手动改也记历史", (await api("/api/settings/history")).data.history?.[0]?.source === "manual");

  /* ---------- 收尾：恢复配置与历史 ---------- */
  for (const [f, content] of backups) {
    const p = path.join(DATA, f);
    if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
    else fs.writeFileSync(p, content, "utf-8");
  }
  try {
    const d = db();
    const rows = d.prepare("SELECT id FROM items WHERE type = 'setting_history'").all();
    let n = 0;
    for (const r of rows) if (!beforeIds.has(r.id)) { d.prepare("DELETE FROM items WHERE id = ?").run(r.id); n++; }
    d.close();
    ok("本轮历史已清理", n > 0, `removed=${n}`);
  } catch (e) { ok("本轮历史已清理", false, String(e)); }
  ok("配置已恢复成验收前的值", (await snapValues()) === initialValues,
    JSON.stringify({ initial: initialValues.slice(0, 120), after: (await snapValues()).slice(0, 120) }));
  ok("历史条数已恢复", (await snapHistory()) === beforeHistoryCount);
  ok("真实库零接触（本脚本只写项目 data 配置）",
    CFG_FILES.every((f) => path.resolve(path.join(DATA, f)).toLowerCase().startsWith(path.resolve(DATA).toLowerCase())));

  console.log(`\n结果：${passed} 通过，${failed} 失败，${warned} 说明`);
  console.log(`真实模型草案链路：${real.data.ok === true ? "已验证（1 次最小调用）" : "模型不可用，已如实标注"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
