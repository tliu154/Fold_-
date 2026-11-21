/**
 * /api/news/[id] —— 单条资讯软删除（三期 C3 第 3 轮）
 * DELETE → 只软删 items(type=feed)，不碰其它 type；已删 404
 */
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const db = getDb();
  const row = db.prepare("SELECT id FROM items WHERE id = ? AND type = 'feed' AND deleted_at IS NULL").get(id);
  if (!row) return Response.json({ error: "资讯条目不存在" }, { status: 404 });
  db.prepare("UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND type = 'feed'")
    .run(new Date().toISOString(), new Date().toISOString(), id);
  return Response.json({ ok: true, id });
}
