/**
 * /api/capture/export —— 导出 .md（一期 A10）
 * GET  ?id=xxx[&dir=子目录]  → 预览 { filename, target, content, vault, dir }（不写文件）
 * POST { id, dir? }        → 确认写入，返回 { preview }
 * 路径安全：目标必须在配置的知识库根目录内；同名文件不覆盖
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getCapture, previewExport, writeExport } from "@/lib/capture";

const postSchema = z.object({
  id: z.string().uuid(),
  dir: z.string().trim().max(100).optional(),
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "缺少 id" }, { status: 400 });
  const item = getCapture(id);
  if (!item) return Response.json({ error: "记录不存在" }, { status: 404 });
  return Response.json(previewExport(item, url.searchParams.get("dir") ?? undefined));
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const item = getCapture(parsed.data.id);
  if (!item) return Response.json({ error: "记录不存在" }, { status: 404 });
  try {
    const preview = writeExport(item, parsed.data.dir);
    return Response.json({ preview });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "导出失败" }, { status: 400 });
  }
}
