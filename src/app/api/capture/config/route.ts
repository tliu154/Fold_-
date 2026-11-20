/**
 * /api/capture/config —— 知识库根目录与导出目录映射（一期 A10）
 * GET  → { vault, dirMap }
 * PUT  { vault?, dirMap? } → { vault, dirMap }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getCaptureConfig, setCaptureConfig } from "@/lib/capture";

const putSchema = z.object({
  vault: z.string().trim().min(1).max(500).optional(),
  dirMap: z.record(z.string().trim().max(100)).optional(),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json(getCaptureConfig());
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
  const cur = getCaptureConfig();
  return Response.json(setCaptureConfig({
    vault: parsed.data.vault ?? cur.vault,
    dirMap: parsed.data.dirMap ?? cur.dirMap,
  }));
}
