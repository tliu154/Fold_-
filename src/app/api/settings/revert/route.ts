/**
 * /api/settings/revert —— 一键回滚一条改动历史
 * POST { id, confirm? } → 把该项恢复成改前值，并**再记一条新历史**（不删旧记录）
 * 若该项之后又被改过 → 409 needsConfirm，前端二次确认后带 confirm:true 重发
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { revertSettingHistory } from "@/lib/settings";

const postSchema = z.object({
  id: z.string().trim().min(1).max(80),
  confirm: z.boolean().optional(),
  source: z.string().trim().max(80).regex(/^[A-Za-z0-9:_-]+$/).optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const r = revertSettingHistory(parsed.data.id, {
    confirm: parsed.data.confirm ?? false,
    source: parsed.data.source,
  });
  if (r.needsConfirm) {
    return Response.json({ ok: false, needsConfirm: true, message: r.message }, { status: 409 });
  }
  if (!r.ok) return Response.json({ error: r.message ?? "回滚失败" }, { status: 400 });
  return Response.json({ ok: true, entry: r.entry });
}
