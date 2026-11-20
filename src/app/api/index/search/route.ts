/**
 * GET /api/index/search —— 直接检索（设置页预览 / e2e 校验用；AI 走 function calling 不走这里）
 * ?q=关键词&tag=标签&limit=10&get=绝对路径&stats=dir|tag
 */
import { requireAuth } from "@/lib/auth";
import { getNote, searchNotes, stats } from "@/lib/indexer";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const get = url.searchParams.get("get");
  const by = url.searchParams.get("stats");
  if (get) {
    const note = getNote(get);
    if (!note) return Response.json({ error: "未找到该笔记" }, { status: 404 });
    return Response.json({ note });
  }
  if (by === "dir" || by === "tag") {
    return Response.json({ stats: stats(by) });
  }
  const q = url.searchParams.get("q") ?? "";
  const tag = url.searchParams.get("tag") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 50) : 10;
  if (!q && !tag) return Response.json({ error: "缺少 q 或 tag 参数" }, { status: 400 });
  return Response.json({ results: searchNotes({ keyword: q || undefined, tag: tag || undefined, limit }) });
}
