/**
 * POST /api/tidy/run —— 执行整理（二期 B3）
 * - 服务端自己重算预览，不接受客户端传路径（防越权）
 * - 一次整理 = 一次 git commit；commit hash + 清单写 data/tidy-log.json
 * - 工作区有未提交改动 / 无可整理文件 → 400 并给出原因
 */
import { requireAuth } from "@/lib/auth";
import { runTidy } from "@/lib/tidy";

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  try {
    return Response.json({ result: runTidy() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
