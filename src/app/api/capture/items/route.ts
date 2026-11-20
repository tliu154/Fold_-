/**
 * GET /api/capture/items?session_id=xxx —— 会话内「记下来」列表
 * GET /api/capture/items（不带 session_id）→ 全部待分类条目
 */
import { requireAuth } from "@/lib/auth";
import { listCaptures } from "@/lib/capture";
import { getDb } from "@/lib/db";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const sid = new URL(req.url).searchParams.get("session_id");
  if (sid) return Response.json({ items: listCaptures(sid) });
  const db = getDb();
  const rows = db.prepare("SELECT * FROM items WHERE type = 'note' AND deleted_at IS NULL").all() as {
    id: string; type: string; title: string | null; content: string | null;
    payload: string; created_at: string; updated_at: string; deleted_at: string | null;
  }[];
  const items = rows.map((r) => {
    const p = JSON.parse(r.payload) as Record<string, unknown>;
    return {
      id: r.id, title: r.title ?? "", content: r.content ?? "",
      tags: p.tags ?? [], session_id: p.session_id ?? "",
      status: p.status ?? "pending", save_batch_id: p.save_batch_id ?? "",
      message_ids: p.message_ids ?? [],
      created_at: r.created_at, updated_at: r.updated_at,
    };
  }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return Response.json({ items });
}
