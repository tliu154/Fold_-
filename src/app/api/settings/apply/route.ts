/**
 * /api/settings/apply —— 用户逐条确认后才落库（AI 绝不直接落库）
 * POST { items: [{key, value, enabled}], source? }
 *  - 服务端**重新校验**（不信任客户端草案值），任一项非法 → 整批拒绝
 *  - 只应用 enabled=true 的项；每项记一条历史（改前/改后/来源）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { applySettings, readSetting, isSettingKey } from "@/lib/settings";

const postSchema = z.object({
  items: z.array(z.object({
    key: z.string().trim().min(1).max(60),
    value: z.unknown(),
    enabled: z.boolean().optional().default(true),
  })).max(20),
  source: z.string().trim().max(80).regex(/^[A-Za-z0-9:_-]+$/).optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "settings-apply"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  // 非法 key 交给 applySettings 统一拒绝；被拦截的敏感项直接回显
  const blocked = parsed.data.items.filter((i) => i.enabled !== false && !isSettingKey(i.key));
  if (blocked.length) {
    return Response.json({
      error: "含只准手动修改的敏感项或未登记项", errors: blocked.map((b) => ({ key: b.key, errors: ["只准手动修改"] })),
    }, { status: 400 });
  }
  const changes = parsed.data.items
    .filter((i) => i.enabled !== false)
    .map((i) => ({ key: i.key, value: i.value }));
  const result = applySettings(changes, parsed.data.source ?? "ai:apply");
  if (!result.ok) {
    return Response.json({ error: result.errors[0]?.errors.join("；") ?? "校验失败", errors: result.errors }, { status: 400 });
  }
  const values: Record<string, unknown> = {};
  for (const k of result.applied) values[k] = readSetting(k);
  return Response.json({ ok: true, applied: result.applied, errors: [], history: result.history, values });
}
