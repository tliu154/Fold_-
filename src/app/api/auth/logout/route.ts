/**
 * POST /api/auth/logout —— 退出登录（v0.6 骨架）
 * 清掉 HttpOnly Session Cookie；Bearer Token 为无状态，前端自行丢弃
 */
import { COOKIE_NAME_FOR_CLEAR } from "@/lib/auth";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME_FOR_CLEAR}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res;
}
