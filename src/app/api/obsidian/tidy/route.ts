/**
 * POST /api/obsidian/tidy —— 整理新笔记（阶段 0 占位）
 * 铁律（9.2）：全平台唯一 Obsidian 入口，仅由「整理新笔记」按钮触发；
 * 不双向同步、不常驻监听、不自动写库；OBSIDIAN_VAULT_PATH 走环境变量；
 * 路径不存在或功能关闭时平台其余功能完全不受影响
 * TODO: 待澄清后实现（判定口径 / 提议形式 / frontmatter 改写等先问清）
 */
import { requireAuth } from "@/lib/auth";
import { notImplemented } from "@/lib/api";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  // TODO: 待澄清后实现
  return notImplemented("obsidian-tidy");
}
