/**
 * 周报生成（三期 C3 第 1 轮）
 *
 * 干什么：把「模板骨架 + 程序填数 + AI 评述」落成一份 **HTML 文件**，
 * 写入内部库未分类区并登记 `items(type=file, subtype=report)`——周报是「文件」的子类，
 * 只多了展示能力，**仍要走内部库整理/批准流程**。另发一条站内轻通知。
 *
 * 分工（用户 2026-11-20 确认的格式草案）：
 *  ① 速览数字 ② 完成明细 ⑥ 数据口径 → 程序填（AI 不得生成/修改任何数字）
 *  ③ 本周评述 ④ 值得留意与下周建议 → AI 写（只写定性，不碰数字、不编事实）
 *  ⑤ 手动重点 → 用户手填，原样呈现、不经过 AI
 *
 * 稳定约束：
 * - **按周幂等**：同一 ISO 周只生成一份，重复触发直接复用（不重写文件、不重复调模型、
 *   不重复发消息）。这让「weekly_digest 定时联动」与「手动生成」共用同一份周报，
 *   全轮只保留 1 次最小真实模型调用
 * - 模型不可用/429 → 评述区如实留空并标 `ai_failed`，**不写占位套话、不用 mock 假装成功**
 * - 升级/复用 C1 `weekly_digest`，不新建第二套任务；推广到其它定时产出留后续
 * - AI 只把「已填好的结构化数据」拿去写定性评述，拿不到也不改任何计数/文件名/日期
 */
import fs from "node:fs";
import path from "node:path";
import { callStructured } from "./chat";
import { collectSources, getReportSources, weekRange, type WeekRange, type SourceBlock } from "./report-sources";
import { writeToUnsorted, registerFile, listFiles, getFile, findBySourcePrefix, purgeFile, updateFile, type InternalFile } from "./internal-vault";
import { createMessage, findBySource, type Message } from "./messages";

export interface AiCommentary {
  commentary: string;
  attention: string;
  suggestions: string;
}

export interface WeeklyReportData {
  range: WeekRange;
  blocks: SourceBlock[];
  ai: AiCommentary | null;
  ai_failed: string | null;
  html: string;
  generated_at: string;
}

export interface GenerateResult {
  file: InternalFile;
  data: WeeklyReportData;
  reused: boolean;
  ai_used: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function sectionList(lines: string[]): string {
  if (!lines.length) return '<p class="empty">（本周无记录）</p>';
  return `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

/** 纯函数式 HTML 模板：所有动态内容一律转义（含 AI 输出） */
export function renderReportHtml(data: WeeklyReportData): string {
  const enabled = data.blocks.filter((b) => b.enabled);
  const stats = enabled.flatMap((b) => b.stats.map((s) => ({ ...s, from: b.label })));
  const detail = enabled.filter((b) => b.id !== "manual_highlights");
  const manual = data.blocks.find((b) => b.id === "manual_highlights");
  const off = data.blocks.filter((b) => !b.enabled);
  const ai = data.ai;

  const statCards = stats.length
    ? stats.map((s) => `<div class="stat"><span class="stat-v">${esc(String(s.value))}</span><span class="stat-l">${esc(s.label)}</span><span class="stat-f">${esc(s.from)}</span></div>`).join("")
    : '<p class="empty">本周没有勾选任何数据源</p>';

  const detailHtml = detail.length
    ? detail.map((b) => `<section class="blk"><h3>${esc(b.label)}</h3>${sectionList(b.lines)}<p class="note">${esc(b.note)}</p></section>`).join("")
    : '<p class="empty">没有启用的明细数据源</p>';

  const aiBlock = (title: string, text: string | null) => `
    <section class="blk ai"><h3>${esc(title)}</h3>
      ${text
        ? `<p>${esc(text).replace(/\n/g, "<br>")}</p>`
        : `<p class="empty">${data.ai_failed
          ? `本周评述未生成（模型不可用：${esc(data.ai_failed)}）`
          : "本周评述未生成（未启用 AI 评述）"}</p>`}
    </section>`;

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fold_归匣 · 周报 ${esc(data.range.key)}</title>
<style>
  :root{--ink:#24302f;--muted:#6b7b79;--accent:#2C5F5D;--soft:#eef4f3;--line:#dfe7e5;--warn:#a9702a;--warnbg:#fbf3e6}
  *{box-sizing:border-box}
  body{margin:0;background:#f7faf9;color:var(--ink);font:15px/1.75 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  .wrap{max-width:820px;margin:0 auto;padding:32px 24px 64px}
  header{border-bottom:2px solid var(--accent);padding-bottom:16px;margin-bottom:28px}
  h1{font-size:26px;margin:0 0 6px;color:var(--accent)}
  .sub{color:var(--muted);font-size:13px}
  h2{font-size:17px;margin:32px 0 14px;padding-left:10px;border-left:4px solid var(--accent)}
  h3{font-size:14px;margin:0 0 8px;color:var(--accent)}
  .stats{display:flex;flex-wrap:wrap;gap:12px}
  .stat{flex:1 1 130px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .stat-v{display:block;font-size:26px;font-weight:700;color:var(--accent);line-height:1.2}
  .stat-l{display:block;font-size:13px;margin-top:2px}
  .stat-f{display:block;font-size:11px;color:var(--muted);margin-top:4px}
  .blk{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 20px;margin-bottom:12px}
  .blk.ai{background:var(--soft);border-color:#cfe0dd}
  ul{margin:0;padding-left:20px}li{margin:3px 0}
  .note{font-size:12px;color:var(--muted);margin:10px 0 0}
  .empty{color:var(--muted);font-size:13px;margin:4px 0}
  .warn{background:var(--warnbg);border:1px solid #eeddbd;border-radius:10px;padding:12px 16px;color:var(--warn);font-size:13px}
  footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
  code{background:#e9efee;padding:1px 5px;border-radius:4px;font-size:12px}
</style></head><body><div class="wrap">
<header>
  <h1>Fold_归匣 · 周报</h1>
  <div class="sub">${esc(data.range.key)} ｜ ${esc(data.range.start)} ~ ${esc(data.range.end)} ｜ 生成于 ${esc(data.generated_at.slice(0, 16).replace("T", " "))}</div>
</header>

<h2>一、速览数字 <span class="sub">（程序填）</span></h2>
<div class="stats">${statCards}</div>

<h2>二、完成明细 <span class="sub">（程序填）</span></h2>
${detailHtml}

<h2>三、本周评述 <span class="sub">（AI 写，仅定性）</span></h2>
${aiBlock("整体回顾", ai?.commentary ?? null)}

<h2>四、值得留意与下周建议 <span class="sub">（AI 写，仅定性）</span></h2>
${aiBlock("值得留意", ai?.attention ?? null)}
${aiBlock("下周建议", ai?.suggestions ?? null)}

<h2>五、手动重点 <span class="sub">（你填的，原样呈现）</span></h2>
<section class="blk">${manual?.enabled
  ? sectionList(manual.lines)
  : '<p class="empty">该数据源已关闭</p>'}
  ${manual?.enabled ? `<p class="note">${esc(manual.note)}</p>` : ""}</section>

<h2>六、数据口径 <span class="sub">（程序填）</span></h2>
<section class="blk">
  <ul>
    <li>统计区间：${esc(data.range.start)} ~ ${esc(data.range.end)}（${esc(data.range.key)}，本地时间）</li>
    <li>启用数据源：${esc(enabled.length ? enabled.map((b) => b.label).join("、") : "无")}</li>
    <li>关闭数据源：${esc(off.length ? off.map((b) => b.label).join("、") : "无")}</li>
    <li>数字全部由网站程序生成；AI 只写定性评述，不生成或修改任何数字、文件名、日期</li>
    <li>AI 评述状态：${data.ai ? "已生成" : data.ai_failed ? `未生成（${esc(data.ai_failed)}）` : "未启用"}</li>
    <li>周报本体是一份 HTML 文件，先落在内部库未分类区，经批准后才分流到用户加入的库</li>
  </ul>
</section>

${data.ai_failed ? `<div class="warn">模型本次不可用，评述区如实留空：<code>${esc(data.ai_failed)}</code>。数字与明细不受影响。</div>` : ""}

<footer>Fold_归匣 · 本机个人 AI 枢纽 ｜ 本文件由定时任务或手动触发生成，浏览器新标签页只读展示</footer>
</div></body></html>`;
}

/** 把结构化数据压成给模型的定性输入（不含原始 HTML，限制长度） */
function aiInput(blocks: SourceBlock[], range: WeekRange): string {
  const lines: string[] = [`统计区间：${range.start} ~ ${range.end}（${range.key}）`];
  for (const b of blocks) {
    if (!b.enabled) { lines.push(`${b.label}：已关闭，未统计`); continue; }
    const stats = b.stats.map((s) => `${s.label}=${s.value}`).join("，");
    lines.push(`${b.label}：${stats || "无统计"}；明细：${b.lines.slice(0, 8).join("、") || "无"}`);
  }
  return lines.join("\n").slice(0, 3000);
}

interface RawAi {
  commentary?: unknown; attention?: unknown; suggestions?: unknown;
}

async function writeCommentary(blocks: SourceBlock[], range: WeekRange): Promise<{ ai: AiCommentary | null; failed: string | null }> {
  try {
    const raw = await callStructured<RawAi>([
      {
        role: "system",
        content: "你是个人周报的评述助手。下面是由程序统计好的本周结构化数据。"
          + "只写定性观察与建议，**不要重复、推导或编造任何数字**，不要编造文件名、事件或日期，不要输出 HTML。"
          + "语气平实、克制、具体，避免套话和鼓励式空话。只输出 JSON 对象，字段："
          + "commentary（本周整体回顾，2-3 句）、attention（值得留意的问题或趋势，1-2 句）、"
          + "suggestions（下周可执行建议，1-2 句）。每项不超过 120 字。某项无话可说就写「本周无明显变化」。",
      },
      { role: "user", content: aiInput(blocks, range) },
    ]);
    const str = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 400) : "";
    const ai: AiCommentary = {
      commentary: str(raw?.commentary), attention: str(raw?.attention), suggestions: str(raw?.suggestions),
    };
    if (!ai.commentary && !ai.attention && !ai.suggestions) {
      return { ai: null, failed: "模型返回了空的评述内容" };
    }
    return { ai, failed: null };
  } catch (e) {
    return { ai: null, failed: (e as Error).message || "模型调用失败" };
  }
}

/** 找本周已生成的周报（按周幂等）；软删除的不算 */
function findByWeek(week: string): InternalFile | null {
  return listFiles({ subtype: "report", limit: 500 }).find((f) => f.week === week) ?? null;
}

/**
 * 生成（或复用）本周周报。
 * - useAi=true 且本周尚无周报时才调一次模型；复用/force=false 不再调
 * - 落内部库未分类区并登记；不在这里发消息（由调用方决定通知口径）
 */
export async function generateWeeklyReport(opts: {
  useAi?: boolean; force?: boolean; now?: Date; source?: string;
} = {}): Promise<GenerateResult> {
  const now = opts.now ?? new Date();
  const range = weekRange(now);
  const existing = findByWeek(range.key);
  if (existing && !opts.force) {
    // 复用：不重写文件、不调模型、不重复发消息
    return {
      file: existing,
      data: {
        range, blocks: collectSources(range), ai: null,
        ai_failed: "复用已有周报（本次未重新生成评述）", html: "",
        generated_at: existing.created_at,
      },
      reused: true, ai_used: false,
    };
  }
  // force 重新生成：覆盖同周那份文件与登记，绝不新增第二份周报
  const forceTarget = opts.force ? existing : null;

  const cfg = getReportSources();
  const blocks = collectSources(range, cfg);
  let ai: AiCommentary | null = null;
  let aiFailed: string | null = opts.useAi ? null : "本次未启用 AI 评述";
  if (opts.useAi) {
    const r = await writeCommentary(blocks, range);
    ai = r.ai;
    aiFailed = r.failed;
  }

  const data: WeeklyReportData = {
    range, blocks, ai, ai_failed: aiFailed,
    html: "", generated_at: now.toISOString(),
  };
  data.html = renderReportHtml(data);

  const filename = `周报_${range.key}.html`;
  let file: InternalFile;
  if (forceTarget && fs.existsSync(forceTarget.path)) {
    // 覆盖同一物理文件（不新增、不改 path），并更新同一条登记的更新时间
    fs.writeFileSync(forceTarget.path, data.html, "utf-8");
    // 复用 internal-vault 的 updateFile 把 updated_at 推进（payload 其余不变）
    file = updateFile(forceTarget.id, {}) ?? forceTarget;
  } else {
    const abs = writeToUnsorted(filename, data.html);
    file = registerFile({
      absPath: abs,
      subtype: "report",
      title: `周报 ${range.key}`,
      tags: ["type/周报"],
      week: range.key,
      source: opts.source ?? `report:${range.key}`,
    });
  }
  return { file, data, reused: false, ai_used: Boolean(ai) };
}

/** 站内轻通知：正文只在文件里，消息只提示「已生成 + 去主页看」 */
export function createReportNotice(result: GenerateResult, trigger: "manual" | "cron", now = new Date()): Message {
  const source = `report:${result.file.id}`;
  const old = findBySource(source);
  if (old) return old;
  const enabled = result.data.blocks.filter((b) => b.enabled).length;
  return createMessage({
    kind: "weekly_digest",
    title: `周报已生成 · ${result.data.range.key}`,
    body: [
      `【周报 · ${result.data.range.key}】${result.data.range.start} ~ ${result.data.range.end}`,
      `已按 ${enabled} 个勾选数据源程序生成 HTML 周报，正文在文件里。`,
      `AI 评述：${result.ai_used ? "已生成" : result.data.ai_failed ? `未生成（${result.data.ai_failed}）` : "未启用"}。`,
      result.reused ? "本周周报已存在，本次直接复用，未重复生成。" : "新周报已放入内部库未分类区，主页周报卡自动展开；整理批准后才分流。",
      "到「首页」最上方查看本周周报，点角落「回顾」可打开以前的周报。",
    ].join("\n"),
    source,
  });
}

/* ---------------- 列表 / 回顾 ---------------- */

export function listReports(limit = 100): InternalFile[] {
  return listFiles({ subtype: "report", limit });
}

export function getReport(id: string): InternalFile | null {
  const f = getFile(id);
  return f && f.subtype === "report" ? f : null;
}

/** 验收清理：按 source 前缀删登记 + 内部库物理文件（已分流到用户库的不动） */
export function purgeReportsBySourcePrefix(prefix: string): number {
  const files = findBySourcePrefix(prefix);
  let n = 0;
  for (const f of files) { purgeFile(f.id); n++; }
  return n;
}

/** 读取已落盘的 HTML（raw 路由用） */
export function readReportHtml(id: string): string | null {
  const f = getReport(id);
  if (!f || !fs.existsSync(f.path)) return null;
  try { return fs.readFileSync(path.resolve(f.path), "utf-8"); } catch { return null; }
}
