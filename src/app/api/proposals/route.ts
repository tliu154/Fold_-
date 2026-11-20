/**
 * /api/proposals —— 审批闸门提案（三期 C2）
 * GET  ?status=pending|approved|rejected|stale → { proposals, pending, model }
 * POST {} → 生成提案预览（**不落库**）：B3 规则 + 一次批量 AI 建议（只补弱标签文件）
 *   - 模型不可用时不报错：降级为纯规则提案，preview.ai_failed 如实写明原因
 *   - 调用方必须再点「保存为提案并通知」（POST /api/proposals/save）才落库
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  generateProposalPreview, listProposals, pendingCount,
  type ProposalStatus,
} from "@/lib/proposals";

const STATUSES = ["pending", "approved", "rejected", "stale"] as const;

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const raw = new URL(req.url).searchParams.get("status");
  const status = STATUSES.includes(raw as ProposalStatus) ? raw as ProposalStatus : undefined;
  return Response.json({
    proposals: listProposals(status),
    pending: pendingCount(),
  });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "proposals-generate"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  try {
    const preview = await generateProposalPreview();
    return Response.json({ preview });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
