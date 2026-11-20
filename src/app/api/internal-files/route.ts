/**
 * /api/internal-files —— 内部文件库（三期 C3）
 * GET → { files, unsorted, preview, proposals, pending }
 *   preview 是纯读的整理建议（不落库、不写文件），一次拉全给知识库页用
 * POST {} → 仅刷新预览（等价于 GET 的 preview 部分）
 */
import { requireAuth } from "@/lib/auth";
import { listFiles, countUnsorted, internalRoot, unsortedDir } from "@/lib/internal-vault";
import { previewFiling, listFilingProposals } from "@/lib/internal-tidy";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  try {
    const preview = previewFiling();
    const listed = listFilingProposals();
    return Response.json({
      files: listFiles({ limit: 200 }),
      unsorted: countUnsorted(),
      preview,
      proposals: listed.proposals,
      pending: listed.pending,
      vault: { root: internalRoot(), unsortedDir: unsortedDir() },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  try {
    return Response.json({ preview: previewFiling() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
