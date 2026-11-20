/**
 * POST /api/proposals/save —— 把预览保存为正式提案（三期 C2）
 * 服务端重算所有路径（不信任客户端 to），与已有 pending 提案按文件去重，
 * 落库后发一条 kind=proposal 站内消息。全部重复时返回 proposal:null，不重复通知。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { saveProposal, pendingCount } from "@/lib/proposals";

const itemSchema = z.object({
  from: z.string().min(1).max(1000),
  dir: z.string().max(200),
  filename: z.string().max(200),
  title: z.string().max(200),
  tags: z.array(z.string().max(100)).max(20),
  enabled: z.boolean().optional(),
  ai_suggested: z.boolean().optional(),
});

const schema = z.object({
  items: z.array(itemSchema).max(200),
  ai_used: z.boolean().optional(),
  ai_failed: z.string().max(500).nullable().optional(),
  source: z.string().max(120).regex(/^[A-Za-z0-9:_-]+$/).optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "proposals-write"), 60, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const proposal = saveProposal(parsed.data);
    return Response.json({
      proposal,
      duplicated: proposal === null,
      pending: pendingCount(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
