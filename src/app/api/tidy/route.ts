/**
 * /api/tidy —— 暂存区整理（二期 B3）
 * GET  → 状态：未整理文件数 / git 是否仓库 / 是否有未提交改动 / 上次整理记录
 * POST /api/tidy/preview → 变更预览（纯读，不移动不改名不 init git）
 * POST /api/tidy/run     → 执行整理（一次整理 = 一次 git commit）
 * - 全部只操作测试知识库；未整理目录越出 D:\我的知识库测试 一律拒绝
 */
import { requireAuth } from "@/lib/auth";
import { previewTidy } from "@/lib/tidy";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  try {
    const p = previewTidy();
    return Response.json({
      inbox: p.inbox,
      inboxExists: p.inboxExists,
      root: p.root,
      options: p.options,
      repo: p.repo,
      hasCommit: p.hasCommit,
      dirty: p.dirty,
      dirtyFiles: p.dirtyFiles,
      canRun: p.canRun,
      blockedReason: p.blockedReason ?? null,
      counts: p.counts,
      last: p.last,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
