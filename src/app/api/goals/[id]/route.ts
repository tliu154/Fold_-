/**
 * /api/goals/:id —— 长期目标编辑 / 删除（一期 A5）
 * PATCH  { title?, description?, target_date?, status?, progress? } → { goal }
 * DELETE → { ok }（从本地配置直接移除，不做软删除/回收站）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { deleteGoal, updateGoal } from "@/lib/goals";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "目标日期格式应为 YYYY-MM-DD").nullable().optional(),
  status: z.enum(["active", "done", "paused"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "goals-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const goal = await updateGoal(id, parsed.data);
  if (!goal) return Response.json({ error: "目标不存在" }, { status: 404 });
  return Response.json({ goal });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "goals-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!(await deleteGoal(id))) return Response.json({ error: "目标不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
