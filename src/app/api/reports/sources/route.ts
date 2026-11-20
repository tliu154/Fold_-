/**
 * /api/reports/sources —— 数据源开关面板（三期 C3）
 * GET → { config, catalog }
 * PUT { enabled?, manual_highlights? } → 原子写 data/report-sources.json
 * - 6 类候选源；只把勾选源填进周报；站内源与 Qwen 资讯不混
 * - 手动重点原样进周报「五、手动重点」，不经过 AI
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import {
  getReportSources, setReportSources, SOURCE_CATALOG,
  type SourceId,
} from "@/lib/report-sources";

const IDS = SOURCE_CATALOG.map((s) => s.id) as [SourceId, ...SourceId[]];

const putSchema = z.object({
  enabled: z.record(z.enum(IDS), z.boolean()).optional(),
  manual_highlights: z.array(z.string().trim().max(200)).max(20).optional(),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ config: getReportSources(), catalog: SOURCE_CATALOG });
}

export async function PUT(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  return Response.json({
    config: setReportSources({
      enabled: parsed.data.enabled,
      manual_highlights: parsed.data.manual_highlights,
    }),
  });
}
