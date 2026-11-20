/**
 * /api/proposals/:id —— 单条提案（三期 C2）
 * GET    → { proposal }
 * PATCH  { items } 逐条编辑（勾选 / 改目录与文件名 / 标题 / 标签）
 *        { status: "rejected" } 驳回（只留档，不动任何文件）
 * DELETE → 软删除（复用 items.deleted_at）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getProposal, updateProposal, softDeleteProposal } from "@/lib/proposals";

const itemSchema = z.object({
  from: z.string().min(1).max(1000),
  dir: z.string().max(200),
  filename: z.string().max(200),
  title: z.string().max(200),
  tags: z.array(z.string().max(100)).max(20),
  enabled: z.boolean().optional(),
  ai_suggested: z.boolean().optional(),
});

const patchSchema = z.union([
  z.object({ status: z.literal("rejected") }),
  z.object({ items: z.array(itemSchema).max(200) }),
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const proposal = getProposal(id);
  if (!proposal) return Response.json({ error: "提案不存在" }, { status: 404 });
  return Response.json({ proposal });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "proposals-write"), 60, 60_000)) {
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
  try {
    const proposal = updateProposal(id, parsed.data);
    if (!proposal) return Response.json({ error: "提案不存在" }, { status: 404 });
    return Response.json({ proposal });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "proposals-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!softDeleteProposal(id)) return Response.json({ error: "提案不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
