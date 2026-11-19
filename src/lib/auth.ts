/**
 * 单用户认证（阶段 0 实做）
 * - 密码登录，签发 HMAC-SHA256 签名 Token
 * - 双形态：HttpOnly Cookie（浏览器页面）+ Bearer Token（API 客户端）
 * - 除 /api/health 外所有 /api/* 路由都必须先过 requireAuth
 */
import crypto from "node:crypto";
import { getAuthPassword, getSessionSecret } from "./config";

const COOKIE_NAME = "fold_session";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

export interface TokenPayload {
  sub: string; // 固定 'owner'（单用户）
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

/** 签发 Token（登录成功后调用） */
export function issueToken(): { token: string; maxAge: number } {
  const payload: TokenPayload = {
    sub: "owner",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${hmac(body)}`, maxAge: TOKEN_TTL_SECONDS };
}

/** 校验 Token 签名与有效期 */
export function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expected = hmac(body);
  // 常数时间比较，防时序攻击
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as TokenPayload;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

/** 密码校验（常数时间，防时序攻击） */
export function checkPassword(input: string): boolean {
  const expected = Buffer.from(getAuthPassword());
  const actual = Buffer.from(input);
  if (expected.length === 0) return false; // 未配置密码则一律拒绝
  if (actual.length !== expected.length) {
    // 长度不同也要跑一次比较，保持耗时稳定
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** 从请求解析登录态：Bearer 优先，其次 Cookie */
export function isAuthenticated(req: Request): boolean {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7).trim());
  }
  const cookie = getCookie(req, COOKIE_NAME);
  if (cookie) return verifyToken(cookie);
  return false;
}

/**
 * 路由守卫：未登录返回 401 Response；已登录返回 null 放行
 * 用法：const denied = requireAuth(req); if (denied) return denied;
 */
export function requireAuth(req: Request): Response | null {
  if (isAuthenticated(req)) return null;
  return Response.json(
    { error: "未登录或会话已过期，请先登录" },
    { status: 401 }
  );
}

/** 登录成功后写 HttpOnly Cookie 的属性 */
export function sessionCookie(token: string, maxAge: number): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export const COOKIE_NAME_FOR_CLEAR = COOKIE_NAME;
