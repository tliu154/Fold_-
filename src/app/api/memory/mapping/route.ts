/**
 * /api/memory/mapping —— 映射表读取 / 覆盖 / 恢复默认（一期 A7）
 * GET  → { mapping, defaults }
 * PUT  { mapping: {...} } → { mapping }（存 memory 表覆盖 TS 常量）
 * DELETE → { mapping }（恢复默认）
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { DEFAULT_MAPPING, getMapping, resetMapping, setMapping, type MappingTable } from "@/lib/memory";

const featureSchema = z.object({
  profile: z.boolean(),
  features: z.array(z.string().max(64)).max(20),
  context: z.boolean(),
});
const putSchema = z.object({
  mapping: z.record(featureSchema),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ mapping: getMapping(), defaults: DEFAULT_MAPPING });
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
  return Response.json({ mapping: setMapping(parsed.data.mapping as MappingTable) });
}

export function DELETE(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ mapping: resetMapping() });
}
