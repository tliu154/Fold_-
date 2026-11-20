/**
 * POST /api/tidy/preview —— 整理变更预览（纯读）
 * 返回每条文件的 from → to、将执行的动作、跳过原因；不写任何文件、不 init git
 */
import { requireAuth } from "@/lib/auth";
import { previewTidy } from "@/lib/tidy";

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  try {
    return Response.json({ preview: previewTidy() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
