/**
 * POST /api/ops/:op_id/resolve —— 冲突解决（阶段 1 新增，规格第 6 条）
 * Body: {resolution: 'server' | 'client'}
 * - server：以主库为准（驳回客户端 op，记原因）
 * - client：以移动端为准（快照 → 强制应用 → 审计 → version+1）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { resolveConflict } from "@/lib/sync";

const bodySchema = z.object({
  resolution: z.enum(["server", "client"], {
    errorMap: () => ({ message: "resolution 须为 server 或 client" }),
  }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ op_id: string }> }
) {
  const denied = requireAuth(req);
  if (denied) return denied;

  const { op_id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }

  const result = resolveConflict(op_id, parsed.data.resolution);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result);
}
