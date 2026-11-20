/**
 * GET /api/internal-files/raw?id=<已登记文件 id> —— 带鉴权只读输出原始文件（三期 C3）
 *
 * 为什么需要：浏览器禁止 http 页面跳 file://，回顾历史周报要「新标签页打开」
 * 就必须有一条同源 HTTP 路由。新标签页会带上登录 Cookie，requireAuth 生效。
 *
 * 安全：只按已登记 id 取路径（客户端**不能**传任意路径）；路径必须落在内部库
 * 或用户加入的库（且限定测试库）内；排除密钥文件名；HTML 加 CSP 禁脚本，
 * 内容全是自生成 + 转义后的静态模板，不执行外部资源。
 */
import { requireAuth } from "@/lib/auth";
import { readRawFile } from "@/lib/internal-vault";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const file = readRawFile(id);
  if (!file) {
    return Response.json({ error: "文件不存在或无权访问" }, { status: 404 });
  }
  const inline = /^(text\/|image\/|application\/json)/.test(file.contentType)
    ? "inline" : "attachment";
  return new Response(new Uint8Array(file.content), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${inline}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'",
    },
  });
}
