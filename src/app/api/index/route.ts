/**
 * /api/index —— 笔记索引状态 / 重建 / 白名单配置（一期 A8）
 * GET            → { count, builtAt, dirs }（惰性：未建过则先建一次）
 * POST           → 重建（手动刷新按钮）
 * PUT { dirs }   → 改白名单并立即重建
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getConfig, indexStatus, rebuildIndex, setConfig } from "@/lib/indexer";

const putSchema = z.object({
  dirs: z.array(z.string().trim().min(1).max(300)).min(1, "至少保留一个索引目录").max(20),
});

function statusOrBuild() {
  const s = indexStatus();
  if (s.builtAt !== null) return s;
  const r = rebuildIndex();
  return { count: r.count, builtAt: r.builtAt, dirs: getConfig().dirs };
}

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json(statusOrBuild());
}

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const r = rebuildIndex();
  return Response.json({ count: r.count, builtAt: r.builtAt, dirs: getConfig().dirs });
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
  setConfig({ dirs: parsed.data.dirs.map((d) => d.replace(/[\\/]+$/, "")) });
  const r = rebuildIndex();
  return Response.json({ count: r.count, builtAt: r.builtAt, dirs: getConfig().dirs });
}
