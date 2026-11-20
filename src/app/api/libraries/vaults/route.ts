/**
 * /api/libraries/vaults —— 「添加一个库」（三期 C3 第 2 轮）
 *
 * 加库 = 像 Obsidian 打开一个已有库：选一个根目录，根下所有文件都属于这个库。
 * - POST  { path } → 加入 knowledgeDirs（并同步 A8 检索白名单 indexDirs）
 * - DELETE{ path } → 移除（至少保留 1 个）
 * - **只影响浏览与检索范围**：exportVault / inboxDir / dirMap / tidy 一律不动，
 *   整理、导出、git 的写入目标不因加库而变（防误写）
 * - 校验：目录必须存在、非隐藏、非项目自身、不与已有库嵌套重复
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getLibraries, setLibraries } from "@/lib/libraries";
import { isUnder } from "@/lib/tidy";

const schema = z.object({ path: z.string().trim().min(1).max(500) });

function checkDir(p: string): { ok: boolean; root?: string; error?: string } {
  const abs = path.resolve(p);
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      return { ok: false, error: "目录不存在或不是文件夹" };
    }
  } catch { return { ok: false, error: "目录无法访问" }; }
  if (abs.split(/[\\/]/).some((s) => s.startsWith("."))) {
    return { ok: false, error: "不能添加隐藏目录" };
  }
  if (/[\\/]develop[\\/]Fold_?(?:[\\/]|$)/i.test(abs)) {
    return { ok: false, error: "不能把项目自身目录加为库" };
  }
  return { ok: true, root: abs };
}

function save(cfg: ReturnType<typeof getLibraries>, knowledgeDirs: string[], indexDirs: string[]) {
  const { version: _v, updated_at: _u, ...rest } = cfg;
  return setLibraries({ ...rest, knowledgeDirs, indexDirs });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const chk = checkDir(parsed.data.path);
  if (!chk.ok || !chk.root) return Response.json({ error: chk.error }, { status: 400 });
  const root = chk.root;
  const cfg = getLibraries();
  const eq = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  if (cfg.knowledgeDirs.some((d) => eq(d, root))) {
    return Response.json({ error: "这个库已经加入过了" }, { status: 400 });
  }
  for (const d of cfg.knowledgeDirs) {
    const r = path.resolve(d);
    if (isUnder(root, r) || isUnder(r, root)) {
      return Response.json({ error: `与已加入的库嵌套：${r}（避免重复扫描）` }, { status: 400 });
    }
  }
  const knowledgeDirs = [...cfg.knowledgeDirs, root];
  // 检索白名单：新库若已落在某个现有白名单根内就不重复加
  const indexDirs = cfg.indexDirs.some((d) => isUnder(root, path.resolve(d)))
    ? cfg.indexDirs : [...cfg.indexDirs, root];
  return Response.json({ ok: true, config: save(cfg, knowledgeDirs, indexDirs), added: root });
}

export async function DELETE(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const target = path.resolve(parsed.data.path);
  const cfg = getLibraries();
  const eq = (a: string) => path.resolve(a).toLowerCase() === target.toLowerCase();
  const idx = cfg.knowledgeDirs.findIndex(eq);
  if (idx < 0) return Response.json({ error: "该库未加入" }, { status: 400 });
  if (cfg.knowledgeDirs.length <= 1) {
    return Response.json({ error: "至少要保留一个库" }, { status: 400 });
  }
  const knowledgeDirs = cfg.knowledgeDirs.filter((_, i) => i !== idx);
  const indexDirs = cfg.indexDirs.filter((d) => !eq(d));
  return Response.json({ ok: true, config: save(cfg, knowledgeDirs, indexDirs), removed: target });
}
