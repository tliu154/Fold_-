/**
 * /api/system-open —— 本机服务端带鉴权调起外部应用（三期 C3 第 2 轮）
 *
 * 浏览器不能直调本地应用，所以由跑在本机的服务端发起：
 * - 文件走 Obsidian：返回 obsidian://，由前端跳转（服务端不执行 URI）
 * - 文件走系统默认应用 / 文件夹打开资源管理器：服务端 PowerShell Invoke-Item
 *
 * 路径只从「已加入的库根 + 库内相对路径」重算，越权一律 403。
 * 客户端不能塞任意绝对路径；接口也不回显服务器绝对路径。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { resolveOpenTarget, launchSystem } from "@/lib/system-open";

const postSchema = z.object({
  rel: z.string().trim().max(500).optional(),
  root: z.string().trim().max(500).optional(),
  path: z.string().trim().max(500).optional(),
  kind: z.enum(["file", "folder"]).optional(),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "system-open"), 40, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  const target = resolveOpenTarget(parsed.data);
  if (!target) {
    return Response.json({ error: "路径不在已加入的库内，或已被排除（隐藏目录 / 密钥文件 / 项目自身）" }, { status: 403 });
  }
  const info = { rel: target.rel, kind: target.kind, ext: target.ext, mode: target.mode };

  if (target.kind === "file" && target.mode === "obsidian" && target.obsidianUri) {
    return Response.json({ ok: true, mode: "obsidian", uri: target.obsidianUri, launched: false, target: info });
  }
  // Obsidian 走不通（库名未配置 / 链接被排除）→ 如实标注并回退系统默认应用
  const launch = launchSystem(target.abs, target.kind);
  return Response.json({
    ok: launch.launched,
    mode: "system",
    launched: launch.launched,
    via: launch.via,
    fallback: target.fallback,
    error: launch.error ?? null,
    note: "已向系统发起打开请求；浏览器无法确认外部应用是否成功启动",
    target: info,
  }, { status: launch.launched ? 200 : 500 });
}
