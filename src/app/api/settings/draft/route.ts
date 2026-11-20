/**
 * /api/settings/draft —— 管家「一句话改设置」出草案（不落库）
 *
 * - 1 次 callStructured 把自然语言解析成结构化改动，再过白名单 + 统一校验 → 逐条草案
 * - **草案只是数据**：不写配置、不写 items、不发站内消息；刷新页面就没了
 * - useAi:false → 如实标注「本次未调用模型」，草案留空，可直接手动编辑
 * - 模型不可用 / 输出异常 → 如实标 ai_failed / ai_bad_output，**不用 mock 假装成功**
 * - AI 不碰任何数字、路径、文件名、日期；敏感项一律拦下并回显原因
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { callStructured } from "@/lib/chat";
import {
  SETTINGS_CATALOG, MANUAL_ONLY_KEYS, readSetting, buildDraft, type AiChange,
} from "@/lib/settings";

const postSchema = z.object({
  text: z.string().trim().min(1).max(500),
  useAi: z.boolean().optional(),
});

interface RawDraft { changes?: unknown; }

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "settings-draft"), 20, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const { text, useAi = true } = parsed.data;

  if (!useAi) {
    return Response.json({
      ok: false, reason: "model_disabled", ai_used: false, items: [],
      error: "本次未调用模型；可直接在下方手动编辑设置，确认后才生效",
    });
  }

  const current: Record<string, unknown> = {};
  for (const def of SETTINGS_CATALOG) current[def.key] = readSetting(def.key);
  const allowed = SETTINGS_CATALOG.map((s) => ({
    key: s.key, label: s.label, desc: s.desc, impact: s.impact,
  }));
  const system = [
    "你是网站「AI 管家」的设置解析助手，懂网站的配置接口。用户用一句话描述想改哪些设置，",
    "你只负责把它翻译成结构化的改动草案，**绝不执行、绝不写入**。",
    "只输出一个 JSON 对象：{\"changes\":[{\"key\":\"...\",\"value\":...,\"reason\":\"...\"}]}。",
    "规则：",
    `1. key 只能是这些允许项之一：${allowed.map((a) => a.key).join(" / ")}。`,
    `2. 这些敏感项一律不许出现在 changes 里：${MANUAL_ONLY_KEYS.join(" / ")}（库路径 / 密钥 / 目录映射 / 鉴权 / 限流只能用户手动改）。`,
    "3. value 必须是该项的**完整新值**（不是补丁），结构要与「当前值」一致：",
    "   - filing_rules: 规则数组，每项 {id,label,exts:string[],tags:string[],note:string}；必须保留一条 exts 为空的兜底规则；tags 的前缀必须在当前 dirMap 里登记过。",
    "   - report_sources: {\"enabled\":{6 个源 id: boolean}}；6 个 id 见当前值。",
    "   - manual_highlights: {\"manual_highlights\": string[]}，最多 20 条，每条不超过 200 字。",
    "   - open_with: {\"obsidian_exts\": string[], \"default\":\"obsidian\"|\"system\"}；扩展名小写含点。",
    "4. reason 用一句中文说明为什么这么改，不超过 100 字。",
    "5. **不得编造或改动任何数字、路径、文件名、日期**；不确定的项就不要放进 changes。",
    "6. 用户没提到的设置不要改。没有可确定的改动就输出 {\"changes\":[]}。",
    "7. 只输出 JSON，不要解释、不要 Markdown、不要 HTML。",
  ].join("\n");
  const user = JSON.stringify({
    instruction: text,
    allowed,
    current,
    manual_only: MANUAL_ONLY_KEYS,
  });

  try {
    const raw = await callStructured<RawDraft>([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    if (!raw || !Array.isArray(raw.changes)) {
      return Response.json({
        ok: false, reason: "ai_bad_output", ai_used: true, items: [],
        error: "模型返回的不是有效的改动列表；未生成草案，请手动编辑或再说一遍",
      });
    }
    const items = buildDraft(raw.changes as AiChange[]);
    return Response.json({ ok: true, reason: null, ai_used: true, items, text });
  } catch (e) {
    return Response.json({
      ok: false, reason: "ai_failed", ai_used: false, items: [],
      error: `模型调用失败：${(e as Error).message || "未知错误"}；未生成草案，可直接手动编辑`,
    });
  }
}
