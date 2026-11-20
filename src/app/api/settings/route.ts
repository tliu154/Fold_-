/**
 * /api/settings —— L0 配置注册表（三期 C3 第 2 轮）
 * GET  → { catalog, manualOnly, values, history }：只读，展示当前值 + 改动历史
 * PUT  { key, value } → 手动改（写死开关）：与 AI 通道**共用同一套校验**，落库 + 记历史
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import {
  SETTINGS_CATALOG, MANUAL_ONLY_KEYS, AI_ALLOWED_KEYS,
  readSetting, applySettings, listSettingHistory,
} from "@/lib/settings";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const values: Record<string, unknown> = {};
  for (const def of SETTINGS_CATALOG) values[def.key] = readSetting(def.key);
  return Response.json({
    catalog: SETTINGS_CATALOG,
    manualOnly: MANUAL_ONLY_KEYS,
    aiAllowed: AI_ALLOWED_KEYS,
    values,
    history: listSettingHistory(50),
  });
}

const putSchema = z.object({
  key: z.string().trim().min(1).max(60),
  value: z.unknown(),
});

export async function PUT(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const result = applySettings([{ key: parsed.data.key, value: parsed.data.value }], "manual");
  if (!result.ok) return Response.json({ error: result.errors[0]?.errors.join("；") ?? "校验失败", errors: result.errors }, { status: 400 });
  return Response.json({ ok: true, applied: result.applied, history: result.history, value: readSetting(result.applied[0]) });
}
