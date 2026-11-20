/**
 * /api/libraries —— 统一资源库配置（二期 B1，B2 增补 obsidianVault）
 * GET → { config }
 * PUT → { config }（同时同步 A8 检索白名单与 A10 导出配置）
 * - obsidianVault 为 optional：旧客户端（如 e2e-libraries）不传时保留已有值，不误清库名
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getLibraries, setLibraries } from "@/lib/libraries";

const putSchema = z.object({
  knowledgeDirs: z.array(z.string().trim().min(1).max(500)).max(20),
  projectDirs: z.array(z.string().trim().min(1).max(500)).max(20),
  indexDirs: z.array(z.string().trim().min(1).max(500)).max(20),
  exportVault: z.string().trim().min(1).max(500),
  dirMap: z.record(z.string().trim().max(100)),
  obsidianVault: z.string().trim().max(200).optional(),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ config: getLibraries() });
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
  const existing = getLibraries();
  const cfg = setLibraries({
    ...parsed.data,
    obsidianVault: parsed.data.obsidianVault ?? existing.obsidianVault,
  });
  return Response.json({ config: cfg });
}
