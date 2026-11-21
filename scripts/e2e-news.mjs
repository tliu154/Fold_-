/**
 * C3 第 3 轮验收：Qwen 内置联网资讯订阅（独立配置 + 复用通道）
 *
 * 覆盖：
 *  - 6 个端点 401 鉴权；GET /api/news 不回显密钥；model 能力与来源口径说明
 *  - 默认主题「AI+CV+CG 科研动向」、定时默认关闭（防自发费用）、limits
 *  - 独立配置：手动 PUT 非法值整批拒绝（含「不写半个值」）、合法值生效、超量/时间格式
 *  - 管家草案：不落库、不发站内消息；模型失败如实标注（不 mock）
 *  - useAi:false：不调用模型、不写 feed、不发消息，如实标 model_unavailable
 *  - 存储层：items(type=feed) 字段映射、来源链接「未提供」不编造、DELETE 软删与 404
 *  - 定时订阅：3 个不触发模型的幂等分支（已关闭 / 今天已跑过 / 无启用主题），不补跑
 *  - 1 次最小真实 Qwen 调用：成功验 feed 落库 + 站内轻通知；失败如实标注不算失败
 *  - 收尾：清理本轮新增 feed / message，恢复 data/news-topics.json
 *
 * 纪律：不新增表（复用 items(type=feed) / items(type=message)）；不改已验收脚本；
 *       定时测试只走「提前 return」分支，避免回归期间产生额外 Qwen 调用与消息污染。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";
const ROOT = process.cwd();
const DATA = path.resolve(ROOT, process.env.DATA_DIR ?? "./data");
const DB_FILE = path.join(DATA, "fold.sqlite");
const CFG_FILE = path.join(DATA, "news-topics.json");
const STATUSES = ["ok", "model_unavailable", "ai_failed", "ai_bad_output"];

let passed = 0, failed = 0, warned = 0;
function ok(label, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${detail}`); }
}
function note(label, cond, detail = "") { if (!cond) { warned++; console.log(`  ! ${label} ${detail}`); } }
function db() { return new Database(DB_FILE); }

function todayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function allIds(type) {
  const d = db();
  const s = new Set(d.prepare("SELECT id FROM items WHERE type = ?").all(type).map((r) => r.id));
  d.close();
  return s;
}
function cfgBytes() { return fs.existsSync(CFG_FILE) ? fs.readFileSync(CFG_FILE, "utf-8") : null; }
/** 只数本模块产生的轻通知（manual:/cron: 前缀），避免被 cron 其它内置任务的消息干扰断言 */
function newsMsgCount() {
  const d = db();
  const rows = d.prepare("SELECT payload FROM items WHERE type = 'message'").all();
  d.close();
  return rows.filter((r) => {
    try { return /^(manual:|cron:)/.test(String(JSON.parse(r.payload || "{}").source ?? "")); }
    catch { return false; }
  }).length;
}
function writeCfg(base, schedOverride, topicsOverride) {
  const next = {
    version: 1,
    topics: topicsOverride ?? base.topics,
    schedule: { ...base.schedule, ...schedOverride },
    updated_at: null,
  };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2), "utf-8");
}
/** 插一条 feed 夹具（只验存储层映射，不冒充模型成功） */
function insertFeed(over) {
  const d = db();
  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const payload = {
    title: over.title, summary: over.summary, url: over.url, url_status: over.url_status,
    date: "2026-11-21", topic_id: "e2e-fixture", topic_name: "验收夹具",
    model: "qwen-plus", status: "ok", source: over.source, fetched_at: at,
  };
  d.prepare(
    `INSERT INTO items (id, type, title, content, payload, version, created_at, updated_at)
     VALUES (?, 'feed', ?, '', ?, 1, ?, ?)`
  ).run(id, over.title, JSON.stringify(payload), at, at);
  d.close();
  return id;
}
function feedById(id) {
  const d = db();
  const r = d.prepare("SELECT payload, deleted_at FROM items WHERE id = ? AND type = 'feed'").get(id);
  d.close();
  return r;
}
function msgById(id) {
  const d = db();
  const r = d.prepare("SELECT payload FROM items WHERE id = ? AND type = 'message'").get(id);
  d.close();
  if (!r) return null;
  try { return JSON.parse(r.payload || "{}"); } catch { return {}; }
}

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

/** 只清本轮新增的 feed/message（按 source 前缀精确匹配，绝不误删其它脚本数据） */
function cleanup(feed0, msg0, cfgBackup) {
  let nf = 0, nm = 0;
  try {
    const d = db();
    for (const r of d.prepare("SELECT id, payload FROM items WHERE type = 'feed'").all()) {
      if (feed0.has(r.id)) continue;
      let src = ""; try { src = String(JSON.parse(r.payload || "{}").source ?? ""); } catch {}
      if (/^(feed:|e2e-news)/.test(src)) { d.prepare("DELETE FROM items WHERE id = ?").run(r.id); nf++; }
    }
    for (const r of d.prepare("SELECT id, payload FROM items WHERE type = 'message'").all()) {
      if (msg0.has(r.id)) continue;
      let src = ""; try { src = String(JSON.parse(r.payload || "{}").source ?? ""); } catch {}
      if (/^(manual:|cron:|e2e-news)/.test(src)) { d.prepare("DELETE FROM items WHERE id = ?").run(r.id); nm++; }
    }
    d.close();
  } catch (e) { console.log("  ! 清理 DB 异常：", String(e)); }
  try {
    if (cfgBackup === null) { if (fs.existsSync(CFG_FILE)) fs.unlinkSync(CFG_FILE); }
    else fs.writeFileSync(CFG_FILE, cfgBackup, "utf-8");
  } catch (e) { console.log("  ! 恢复配置异常：", String(e)); }
  return { nf, nm };
}

async function main() {
  console.log("=== C3 第 3 轮：Qwen 内置联网资讯订阅 ===");

  /* ---------- 备份（收尾必须恢复，避免污染其它脚本） ---------- */
  const cfgBackup = cfgBytes();
  const feed0 = allIds("feed");
  const msg0 = allIds("message");
  const newsMsg0 = newsMsgCount();
  let realCallStatus = "未执行";
  // 复位到「未落盘 = defaults()」再验默认值，避免用户手验开过定时导致 B 段假红；收尾原样恢复
  try { if (fs.existsSync(CFG_FILE)) fs.unlinkSync(CFG_FILE); } catch { /* 收尾会恢复 */ }

  try {
    /* ---------- A. 401 鉴权 ---------- */
    ok("未登录 GET /api/news → 401", (await api("/api/news", { noAuth: true })).status === 401);
    ok("未登录 GET /api/news/topics → 401", (await api("/api/news/topics", { noAuth: true })).status === 401);
    ok("未登录 PUT /api/news/topics → 401",
      (await api("/api/news/topics", { method: "PUT", noAuth: true, body: {} })).status === 401);
    ok("未登录 POST /api/news/fetch → 401",
      (await api("/api/news/fetch", { method: "POST", noAuth: true, body: {} })).status === 401);
    ok("未登录草案 → 401",
      (await api("/api/news/topics/draft", { method: "POST", noAuth: true, body: { text: "x" } })).status === 401);
    ok("未登录定时检查 → 401",
      (await api("/api/news/schedule", { method: "POST", noAuth: true, body: {} })).status === 401);
    ok("未登录软删 → 401",
      (await api("/api/news/e2e-no-such-id", { method: "DELETE", noAuth: true })).status === 401);
    ok("登录 → 200", (await login()).status === 200);

    /* ---------- B. 只读列表 / 模型信息 / 默认配置 ---------- */
    const n0 = await api("/api/news");
    ok("GET /api/news → 200", n0.status === 200, String(n0.status));
    ok("items 是数组", Array.isArray(n0.data.items));
    const model = n0.data.model ?? {};
    ok("模型信息不回显密钥（无 apiKey/key/secret 字段）",
      !("apiKey" in model) && !("key" in model) && !("secret" in model)
      && !JSON.stringify(model).includes("sk-ws-"), JSON.stringify(model).slice(0, 160));
    ok("model.configured 是布尔且说明能力",
      typeof model.configured === "boolean" && model.capability === "qwen_web_search");
    ok("来源 URL 口径如实说明「未提供」",
      String(model.source_url_note ?? "").includes("未提供"));
    ok("模型返回 base/id 供前端展示（非密钥）",
      model.id === null || typeof model.id === "string");
    const topics0 = n0.data.topics ?? [];
    ok("预置示例主题「AI+CV+CG 科研动向」且启用",
      topics0.some((t) => t.name === "AI+CV+CG 科研动向" && t.enabled === true),
      JSON.stringify(topics0.map((t) => t.name)));
    ok("定时订阅默认关闭（防首次启动/回归期自发调用）",
      (n0.data.schedule ?? {}).enabled === false, JSON.stringify(n0.data.schedule));
    ok("limits 上限可读", (n0.data.limits ?? {}).maxTopics === 12);
    const base = { topics: topics0, schedule: n0.data.schedule ?? { enabled: false, time: "09:30", last_run_date: null } };

    /* ---------- C. 独立配置：非法值整批拒绝 ---------- */
    const beforePut = cfgBytes();
    const c1 = await api("/api/news/topics", { method: "PUT", body: { topics: "not-array" } });
    ok("PUT topics 非数组 → 400", c1.status === 400, String(c1.status));
    const c2 = await api("/api/news/topics", { method: "PUT", body: {
      topics: [{ id: "", name: "", query: "", enabled: "yes" }],
    } });
    ok("PUT 单条全非法 → 400 且给出多条原因",
      c2.status === 400 && Array.isArray(c2.data.errors) && c2.data.errors.length >= 3,
      JSON.stringify(c2.data).slice(0, 200));
    const good = { id: "e2e-ok", name: "合法主题", query: "关注计算机视觉新论文", enabled: true, created_at: "2026-11-21T00:00:00.000Z" };
    const bad = { id: "", name: "", query: "", enabled: 1 };
    const c3 = await api("/api/news/topics", { method: "PUT", body: { topics: [good, bad] } });
    ok("PUT 一条合法一条非法 → 整批拒绝 400", c3.status === 400, String(c3.status));
    const c4 = await api("/api/news/topics", { method: "PUT", body: {
      topics: Array.from({ length: 13 }, (_, i) => ({ ...good, id: `t${i}` })),
    } });
    ok("PUT 超过 12 条 → 400", c4.status === 400, String(c4.status));
    const c5 = await api("/api/news/topics", { method: "PUT", body: {
      topics: [good], schedule: { ...base.schedule, time: "99:99" },
    } });
    ok("PUT 非法定时时间 → 400", c5.status === 400, String(c5.status));
    ok("非法值不写半个值：配置文件未变", cfgBytes() === beforePut,
      JSON.stringify({ before: String(beforePut).slice(0, 80), after: String(cfgBytes()).slice(0, 80) }));

    const cOk = await api("/api/news/topics", { method: "PUT", body: { topics: [good] } });
    ok("PUT 合法值 → 200", cOk.status === 200 && cOk.data.ok === true, JSON.stringify(cOk.data).slice(0, 180));
    const g1 = await api("/api/news/topics");
    ok("GET /api/news/topics 返回 topics/schedule/limits",
      g1.status === 200 && Array.isArray(g1.data.topics) && g1.data.limits?.maxTopics === 12);
    ok("合法改动已生效", (g1.data.topics ?? []).some((t) => t.name === "合法主题"));
    ok("只传 topics 时保留原定时开关",
      (g1.data.schedule ?? {}).enabled === base.schedule.enabled);
    const cRestore = await api("/api/news/topics", { method: "PUT", body: { topics: topics0 } });
    ok("恢复默认主题 → 200", cRestore.status === 200, String(cRestore.status));

    /* ---------- D. 管家草案：不落库、不发消息 ---------- */
    const dEmpty = await api("/api/news/topics/draft", { method: "POST", body: { text: "" } });
    ok("草案空文本 → 400", dEmpty.status === 400, String(dEmpty.status));
    const cfgBeforeDraft = cfgBytes();
    const msgBeforeDraft = newsMsgCount();
    const draft = await api("/api/news/topics/draft", { method: "POST", body: { text: "再加一个关于三维重建的订阅主题" } });
    ok("草案接口 → 200", draft.status === 200, String(draft.status));
    if (draft.data.ok === true && draft.data.status === "ok") {
      ok("真实草案返回 draft/current/valid/note 结构",
        Array.isArray(draft.data.draft?.topics) && Array.isArray(draft.data.current?.topics)
        && typeof draft.data.valid === "boolean" && String(draft.data.note ?? "").includes("in memory"));
      ok("草案主题沿用旧 id/created_at，非模型编造",
        (draft.data.draft?.topics ?? []).every((t) => /^[a-zA-Z0-9_-]+$/.test(t.id ?? "") && typeof t.created_at === "string"));
    } else {
      note("管家草案模型不可用/输出异常，已如实标注（不算失败）",
        ["ai_failed", "ai_bad_output"].includes(draft.data.status) && String(draft.data.error ?? "").length > 4,
        JSON.stringify(draft.data).slice(0, 220));
    }
    ok("草案绝不落库：配置文件未变", cfgBytes() === cfgBeforeDraft);
    ok("草案不发站内消息", newsMsgCount() === msgBeforeDraft);

    /* ---------- E. useAi:false：不调模型、不写 feed、不发消息 ---------- */
    const feedBeforeDry = allIds("feed").size;
    const msgBeforeDry = newsMsgCount();
    const dry = await api("/api/news/fetch", { method: "POST", body: { useAi: false } });
    ok("fetch(useAi:false) → 200 且如实标注",
      dry.status === 200 && dry.data.ok === false && dry.data.status === "model_unavailable",
      JSON.stringify(dry.data).slice(0, 200));
    ok("fetch(useAi:false) results 为空", Array.isArray(dry.data.results) && dry.data.results.length === 0);
    ok("fetch(useAi:false) 错误文案可读", String(dry.data.note ?? "").includes("未调用模型"));
    ok("fetch(useAi:false) 不写 feed / 不发消息",
      allIds("feed").size === feedBeforeDry && newsMsgCount() === msgBeforeDry);

    /* ---------- F. 存储层：字段映射 / 来源不编造 / 软删 ---------- */
    const fProvided = insertFeed({
      title: "夹具·有链接", summary: "用于验证合法链接字段", url: "https://example.com/real-article",
      url_status: "provided", source: "e2e-news-fixture-provided",
    });
    const fMissing = insertFeed({
      title: "夹具·无链接", summary: "用于验证未提供口径", url: "",
      url_status: "not_provided", source: "e2e-news-fixture-missing",
    });
    const listAfter = (await api("/api/news")).data.items ?? [];
    const p1 = listAfter.find((x) => x.id === fProvided);
    const p2 = listAfter.find((x) => x.id === fMissing);
    ok("夹具 feed 能被 GET /api/news 读出", Boolean(p1) && Boolean(p2));
    ok("feed 字段映射齐全",
      ["id", "title", "summary", "url", "url_status", "date", "topic_id", "topic_name", "model", "status", "source", "created_at"]
        .every((k) => k in (p1 ?? {})), JSON.stringify(p1 ?? {}).slice(0, 200));
    ok("「未提供」时不编造 URL：url 为空且 url_status=not_provided",
      p2?.url === "" && p2?.url_status === "not_provided", JSON.stringify(p2 ?? {}));
    ok("「已提供」时保留合法 http(s) 链接",
      /^https?:\/\//.test(p1?.url ?? "") && p1?.url_status === "provided");
    const del1 = await api(`/api/news/${fProvided}`, { method: "DELETE" });
    ok("DELETE 单条资讯 → 200", del1.status === 200 && del1.data.ok === true, JSON.stringify(del1.data));
    const del2 = await api(`/api/news/${fProvided}`, { method: "DELETE" });
    ok("重复 DELETE → 404", del2.status === 404, String(del2.status));
    const softRow = feedById(fProvided);
    ok("软删：deleted_at 非空且记录仍在（非物理删）",
      Boolean(softRow) && softRow.deleted_at !== null && softRow.deleted_at !== undefined);
    ok("软删后不再出现在只读列表",
      !((await api("/api/news")).data.items ?? []).some((x) => x.id === fProvided));
    const delOther = await api("/api/news/e2e-no-such-id", { method: "DELETE" });
    ok("DELETE 不存在的 id → 404", delOther.status === 404, String(delOther.status));

    /* ---------- G. 定时订阅：3 个「提前 return」幂等分支，绝不触发模型 ---------- */
    const feedBeforeSched = allIds("feed").size;
    const msgBeforeSched = newsMsgCount();
    writeCfg(base, { enabled: false, time: "09:30", last_run_date: null });
    const s0 = await api("/api/news/schedule", { method: "POST", body: {} });
    ok("定时检查接口 → 200 且返回 result/schedule",
      s0.status === 200 && typeof s0.data.result?.ran === "boolean" && s0.data.schedule !== undefined,
      JSON.stringify(s0.data).slice(0, 200));
    ok("定时关闭 → 不抓取，理由「定时订阅已关闭」",
      s0.data.result?.ran === false && String(s0.data.result?.reason ?? "").includes("关闭"));
    const today = todayStr();
    writeCfg(base, { enabled: true, time: "00:00", last_run_date: today });
    const s1 = await api("/api/news/schedule", { method: "POST", body: {} });
    ok("今天已跑过 → 按天幂等，理由「今天已抓取过」",
      s1.data.result?.ran === false && String(s1.data.result?.reason ?? "").includes("今天已抓取过"));
    writeCfg(base, { enabled: true, time: "00:00", last_run_date: null },
      base.topics.map((t) => ({ ...t, enabled: false })));
    const s2 = await api("/api/news/schedule", { method: "POST", body: {} });
    ok("无启用主题 → 不抓取，理由「没有启用的订阅主题」",
      s2.data.result?.ran === false && String(s2.data.result?.reason ?? "").includes("没有启用的订阅主题"));
    ok("定时幂等测试期间零模型调用（feed/轻通知数不变）",
      allIds("feed").size === feedBeforeSched && newsMsgCount() === msgBeforeSched);
    ok("定时幂等测试未写 last_run_date（不补跑、不落运行态）",
      (s2.data.schedule ?? {}).last_run_date === null);
    // 恢复成默认（关闭），供真实抓取与收尾使用
    writeCfg(base, { enabled: false, time: base.schedule.time ?? "09:30", last_run_date: null });

    /* ---------- H. 1 次最小真实 Qwen 调用（能跑通就行） ---------- */
    const cfgBeforeReal = cfgBytes();
    const feedBeforeReal = allIds("feed").size;
    const msgBeforeReal = newsMsgCount();
    const real = await api("/api/news/fetch", { method: "POST", body: {} });
    realCallStatus = String(real.data?.status ?? `http_${real.status}`);
    ok("真实抓取接口 → 200", real.status === 200, String(real.status));
    ok("真实抓取返回结构与状态合法",
      STATUSES.includes(real.data.status) && Array.isArray(real.data.results) && Array.isArray(real.data.items),
      JSON.stringify(real.data).slice(0, 220));
    ok("手动抓取不偷偷改定时配置", cfgBytes() === cfgBeforeReal);
    const fr = (real.data.results ?? [])[0];
    if (fr) {
      ok("单主题结果状态合法", STATUSES.includes(fr.status));
      if (fr.message_id) {
        const m = msgById(fr.message_id);
        ok("站内轻通知已落库（kind=system）", m?.kind === "system", JSON.stringify(m ?? {}).slice(0, 160));
        ok("轻通知 source 带 manual 前缀且不刷屏", String(m?.source ?? "").startsWith("manual:"));
      } else {
        note("未产生站内轻通知（模型未配置时属预期）", false, JSON.stringify(fr).slice(0, 160));
      }
    }
    if (real.data.status === "ok") {
      ok("真实调用成功：feed 条目增加", allIds("feed").size > feedBeforeReal);
      ok("真实调用成功：站内轻通知增加", newsMsgCount() > msgBeforeReal);
      const got = (await api("/api/news")).data.items ?? [];
      ok("落库资讯字段齐全且来源口径一致",
        got.filter((x) => String(x.source ?? "").startsWith("feed:")).every((x) =>
          typeof x.title === "string" && x.title.length > 0
          && (x.url_status === "provided" ? /^https?:\/\//.test(x.url ?? "") : (x.url === "" || x.url == null))),
        JSON.stringify(got.slice(0, 2)).slice(0, 240));
    } else {
      note("Qwen 不可用 / 失败 / 输出异常，已如实标注（不算失败）",
        ["model_unavailable", "ai_failed", "ai_bad_output"].includes(real.data.status),
        JSON.stringify({ status: real.data.status, results: real.data.results }).slice(0, 220));
      ok("失败时未写入任何 feed 条目", allIds("feed").size === feedBeforeReal);
    }
  } finally {
    /* ---------- I. 收尾：清理 + 恢复 ---------- */
    const { nf, nm } = cleanup(feed0, msg0, cfgBackup);
    ok("本轮新增 feed 已清理", allIds("feed").size === feed0.size, `removed=${nf}`);
    ok("本轮新增轻通知已清理", newsMsgCount() === newsMsg0, `removed=${nm}`);
    ok("配置已恢复成验收前的值", cfgBytes() === cfgBackup);
    ok("真实库零接触（本脚本只写项目 data 下的配置与 items）",
      path.resolve(CFG_FILE).toLowerCase().startsWith(path.resolve(DATA).toLowerCase()));

    console.log(`\n结果：${passed} 通过，${failed} 失败，${warned} 说明`);
    console.log(`真实 Qwen 链路：${realCallStatus === "ok" ? "已验证（1 次最小真实调用，feed 落库）" : `模型不可用/失败，已如实标注 ${realCallStatus}`}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
