/**
 * /api/reports —— 周报（三期 C3）
 * GET  → { reports, latest, sources }（按周倒序，供主页折叠卡 + 回顾弹框）
 * POST { useAi?, force? } → 生成/复用本周周报（HTML 落内部库 + 登记 + 站内轻通知）
 *   - 按 ISO 周幂等：本周已生成则 reused=true、不重写文件、不重复调模型
 *   - useAi 默认 true（写定性评述）；模型不可用如实标 ai_failed，不假装成功
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { generateWeeklyReport, createReportNotice, listReports } from "@/lib/reports";
import { getReportSources, SOURCE_CATALOG } from "@/lib/report-sources";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const reports = listReports(100);
  return Response.json({
    reports,
    latest: reports[0] ?? null,
    sources: getReportSources(),
    catalog: SOURCE_CATALOG,
  });
}

const postSchema = z.object({
  useAi: z.boolean().optional(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "reports-generate"), 20, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown = {};
  try { body = await req.json(); } catch { /* 空体用默认值 */ }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  try {
    const result = await generateWeeklyReport({
      useAi: parsed.data.useAi ?? true,
      force: parsed.data.force ?? false,
      source: "manual:api",
    });
    const message = createReportNotice(result, "manual");
    return Response.json({
      report: result.file,
      data: result.data,
      reused: result.reused,
      ai_used: result.ai_used,
      message,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
