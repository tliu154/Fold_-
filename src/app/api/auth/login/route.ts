/**
 * POST /api/auth/login —— 单用户登录（阶段 0 实做）
 * - zod 校验入参；简单限流；常数时间密码比较
 * - 成功：签发 HMAC Token，写 HttpOnly Cookie，Body 同时返回 Bearer Token
 */
import { z } from "zod";
import { checkPassword, issueToken, sessionCookie } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

export async function POST(req: Request) {
  // 限流：每 IP 每分钟 10 次
  if (!rateLimit(clientKey(req, "login"), 10, 60_000)) {
    return Response.json({ error: "尝试过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }

  if (!checkPassword(parsed.data.password)) {
    return Response.json({ error: "密码错误" }, { status: 401 });
  }

  const { token, maxAge } = issueToken();
  const res = Response.json({ ok: true, token, tokenType: "Bearer", expiresIn: maxAge });
  res.headers.append("Set-Cookie", sessionCookie(token, maxAge));
  return res;
}
