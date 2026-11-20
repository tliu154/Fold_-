/**
 * /api/filing —— 内部库整理提案（三期 C3）
 * GET  ?status=pending|approved|rejected|stale → { proposals, pending, rules, dirs }
 * POST { items, source? } → 保存为提案（去重 + 发站内轻通知），返回 { proposal, duplicated, pending }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  saveFilingProposal, listFilingProposals, DEFAULT_FILING_RULES, allowedDirs,
  type FilingStatus,
} from "@/lib/internal-tidy";

const STATUSES = ["pending", "approved", "rejected", "stale"] as const;

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

const postSchema = z.object({
  items: z.array(itemSchema).max(200),
  source: z.string().max(120).regex(/^[A-Za-z0-9:_-]+$/).optional(),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const raw = new URL(req.url).searchParams.get("status");
  const status = STATUSES.includes(raw as FilingStatus) ? raw as FilingStatus : undefined;
  const listed = listFilingProposals(status);
  return Response.json({
    proposals: listed.proposals,
    pending: listed.pending,
    rules: DEFAULT_FILING_RULES,
    dirs: allowedDirs(),
  });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "filing-save"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const proposal = saveFilingProposal({
      items: parsed.data.items,
      source: parsed.data.source,
    });
    return Response.json({
      proposal,
      duplicated: proposal === null,
      pending: listFilingProposals().pending,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
