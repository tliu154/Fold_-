/**
 * GET /api/libraries/files/meta?path=xxx —— 单个文件元信息（二期 B1，只读）
 */
import { requireAuth } from "@/lib/auth";
import { getFileMeta } from "@/lib/files";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const p = new URL(req.url).searchParams.get("path");
  if (!p) return Response.json({ error: "缺少 path" }, { status: 400 });
  const meta = getFileMeta(p);
  if (!meta) return Response.json({ error: "文件不存在或不在索引范围" }, { status: 404 });
  return Response.json({ file: meta });
}
