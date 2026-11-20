/**
 * /api/filing/:id —— 单条内部库整理提案（三期 C3）
 * GET    → { proposal }
 * PATCH  { items } 编辑逐条清单；或 { status: "rejected" } 驳回
 * DELETE → 软删除
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getFilingProposal, updateFilingProposal, deleteFilingProposal } from "@/lib/internal-tidy";

type Ctx = { params: Promise<{ id: string }> };

const itemSchema = z.object({
  from: z.string().min(1).max(1000),
  file_id: z.string().max(100).optional(),
  filename: z.string().max(300).optional(),
  dir: z.string().max(100).optional(),
  title: z.string().max(300).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  ext: z.string().max(20).optional(),
  subtype: z.enum(["report", "note", "other"]).optional(),
  actions: z.array(z.string().max(40)).max(10).optional(),
  enabled: z.boolean().optional(),
  rule: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
  reason: z.string().max(200).optional(),
});

const patchSchema = z.union([
  z.object({ status: z.literal("rejected") }),
  z.object({ items: z.array(itemSchema).max(200) }),
]);

export async function GET(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const proposal = getFilingProposal(id);
  if (!proposal) return Response.json({ error: "提案不存在" }, { status: 404 });
  return Response.json({ proposal });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const proposal = updateFilingProposal(id, parsed.data);
    if (!proposal) return Response.json({ error: "提案不存在或状态不允许编辑" }, { status: 400 });
    return Response.json({ proposal });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const ok = deleteFilingProposal(id);
  if (!ok) return Response.json({ error: "提案不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
