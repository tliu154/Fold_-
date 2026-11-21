/**
 * API 探针（v0.6 清单 1.5 · 开工第一件事）
 * 验证日常模型 DeepSeek 的四项能力，确认清单里的型号快照可直接用：
 *   1) 连通 + 真实 model id（/models）
 *   2) OpenAI 兼容 chat（普通问答）
 *   3) 结构化输出（response_format = json_object）
 *   4) function calling（tools 返回工具调用）
 *
 * 用法：node scripts/probe-api.mjs
 * - API key 从项目根 .env 读取（DEEPSEEK_API_KEY），绝不写进本文件 / 打印完整值
 * - 只做只读探测，不写库、不产生业务数据；会产生极少量模型调用费用
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i > 0) env[s.slice(0, i).trim()] = s.slice(i + 1).trim();
  }
  return env;
}

const E = loadEnv();
const KEY = E.DEEPSEEK_API_KEY || "";
const BASE = (E.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "");
const MODEL = E.DEEPSEEK_MODEL || "deepseek-flash";

let pass = 0;
let fail = 0;
function result(name, ok, detail = "") {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

async function call(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, data, text };
}

console.log("DeepSeek API 探针");
console.log(`  base = ${BASE}`);
console.log(`  model(config) = ${MODEL}`);
console.log(`  key = ${KEY ? KEY.slice(0, 6) + "…" + KEY.slice(-4) : "(未配置)"}`);
console.log("");

if (!KEY || KEY.startsWith("sk-<")) {
  console.error("未配置 DEEPSEEK_API_KEY，请在 .env 填入后重试。");
  process.exit(2);
}

// 1. 连通 + model id
try {
  const res = await fetch(BASE + "/models", {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id);
  result("1. 连通 /models", res.status === 200, `HTTP ${res.status}`);
  result("1b. 配置 model 存在", ids.includes(MODEL), ids.length ? `可用: ${ids.join(", ")}` : "未返回模型列表");
} catch (e) {
  result("1. 连通 /models", false, e.message);
}

// 2. 普通 chat
try {
  const r = await call("/chat/completions", {
    model: MODEL,
    messages: [{ role: "user", content: "只回复两个字：收到" }],
    max_tokens: 16,
  });
  const content = r.data?.choices?.[0]?.message?.content;
  result("2. OpenAI 兼容 chat", r.status === 200 && typeof content === "string", `HTTP ${r.status}`);
} catch (e) {
  result("2. OpenAI 兼容 chat", false, e.message);
}

// 3. 结构化输出
// deepseek-flash 实测偶发返回 HTTP 200 但 content 为空（瞬时故障，非能力缺失）。
// 有限重试 3 次真实调用，成功即通过并如实打印第几次成功；3 次都空才判失败（不 mock）。
try {
  let ok3 = false, detail3 = "";
  for (let attempt = 1; attempt <= 3 && !ok3; attempt++) {
    const r = await call("/chat/completions", {
      model: MODEL,
      messages: [{ role: "user", content: "返回 JSON：{\"ok\":true}" }],
      response_format: { type: "json_object" },
      max_tokens: 128,
    });
    const content = r.data?.choices?.[0]?.message?.content ?? "";
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* 非 JSON */ }
    ok3 = r.status === 200 && parsed && typeof parsed === "object";
    detail3 = ok3 ? `HTTP ${r.status} · 第 ${attempt} 次成功` : `HTTP ${r.status} · 第 ${attempt} 次空内容`;
    if (!ok3 && attempt < 3) await new Promise((s) => setTimeout(s, 400));
  }
  result("3. 结构化输出 json_object", ok3, detail3);
} catch (e) {
  result("3. 结构化输出 json_object", false, e.message);
}

// 4. function calling
try {
  const r = await call("/chat/completions", {
    model: MODEL,
    messages: [{ role: "user", content: "上海现在天气如何？用工具查。" }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "查询城市天气",
          parameters: {
            type: "object",
            properties: { city: { type: "string", description: "城市名" } },
            required: ["city"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 128,
  });
  const calls = r.data?.choices?.[0]?.message?.tool_calls;
  result(
    "4. function calling",
    r.status === 200 && Array.isArray(calls) && calls.length > 0,
    `HTTP ${r.status}${calls?.length ? " · " + calls[0]?.function?.name : ""}`
  );
} catch (e) {
  result("4. function calling", false, e.message);
}


/* ---------------- Qwen 联网探针（C3 第 3 轮） ----------------
 * 1 次最小真实调用验证 key / model / enable_search 联网能力。
 * 不打印完整 key；失败如实标注，不 mock 假装成功。
 */
console.log("");
console.log("Qwen 联网资讯探针（C3 第 3 轮）");
const QKEY = E.QWEN_API_KEY || "";
const QBASE = (E.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
const QMODEL = E.QWEN_MODEL || "qwen-plus";
console.log(`  base = ${QBASE}`);
console.log(`  model = ${QMODEL}`);
console.log(`  key = ${QKEY ? QKEY.slice(0, 6) + "..." + QKEY.slice(-4) : "(未配置)"}`);

if (!QKEY) {
  result("Q1. 已配置 QWEN_API_KEY", false, "未配置，资讯功能将如实标 model_unavailable");
} else {
  result("Q1. 已配置 QWEN_API_KEY", true);
  // GET /models 不产生 token 费用
  try {
    const qr = await fetch(QBASE + "/models", { headers: { Authorization: `Bearer ${QKEY}` } });
    const qd = await qr.json().catch(() => ({}));
    const qids = (qd.data || []).map((m) => m.id);
    result("Q2. GET /models 连通", qr.status === 200, `HTTP ${qr.status} · ${qids.length} 个模型`);
    result("Q2b. 配置的 model 在列表里", qids.includes(QMODEL), qids.length ? "可用，例如 " + qids.slice(0, 5).join(", ") : "未返回模型列表");
  } catch (e) {
    result("Q2. GET /models 连通", false, e.message);
  }
  // 1 次最小真实调用：enable_search + json_object 共存
  try {
    const qr = await fetch(QBASE + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${QKEY}` },
      body: JSON.stringify({
        model: QMODEL,
        messages: [{ role: "user", content: "只返回 JSON 对象：{\"ok\":true}" }],
        max_tokens: 64,
        enable_search: true,
        search_options: { forced_search: true, enable_source: true },
        response_format: { type: "json_object" },
      }),
    });
    const qtext = await qr.text();
    let qd = {};
    try { qd = JSON.parse(qtext); } catch { /* 非 JSON */ }
    const content = qd?.choices?.[0]?.message?.content ?? "";
    let parsed = null;
    try { parsed = JSON.parse(content); } catch { /* 非 JSON */ }
    result("Q3. enable_search + json_object 共存", qr.status === 200 && parsed && typeof parsed === "object",
      `HTTP ${qr.status}${qd?.error ? " · " + (qd.error.message || "") : ""}`);
  } catch (e) {
    result("Q3. enable_search + json_object 共存", false, e.message);
  }
}

console.log("");
console.log(`结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
