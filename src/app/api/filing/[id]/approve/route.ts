/**
 * POST /api/filing/:id/approve —— 批准并执行内部库整理提案（三期 C3）
 * 服务端重算 to（不信任客户端）、逐条占用/同名保护 → 从内部库移动到用户加入的库
 * → 一次批准一次 git commit → 更新文件索引状态 + commit hash。
 * 无可移动文件 / 重复批准 → 400，提案保持可重试。
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { approveFilingProposal } from "@/lib/internal-tidy";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "filing-approve"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const { id } = await ctx.params;
  try {
    const { proposal, result } = approveFilingProposal(id);
    return Response.json({ proposal, result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
