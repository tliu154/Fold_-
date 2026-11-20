/**
 * GET /api/libraries/files —— 文件列表（二期 B1，只读）
 * ?kind=md|pdf|html|doc|other|all&dir=xxx&limit=200
 */
import { requireAuth } from "@/lib/auth";
import { listDirs, listFiles } from "@/lib/files";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 200;
  const result = listFiles({
    kind: url.searchParams.get("kind") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    limit,
  });
  return Response.json({ ...result, dirs: listDirs() });
}
