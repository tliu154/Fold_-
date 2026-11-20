/**
 * POST /api/proposals/:id/approve —— 批准并执行提案（三期 C2）
 * 复用 B3 的 runTidyItems：逐条重新校验、占用跳过、一次批准 = 一次 git commit，
 * commit hash 与清单写回提案 + tidy-log.json 作回滚记录。
 * 工作区有未提交改动 / 无可移动文件 → 400，提案保持 pending 可重试。
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { approveProposal } from "@/lib/proposals";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "proposals-approve"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  try {
    const { proposal, result } = approveProposal(id);
    return Response.json({ proposal, result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
