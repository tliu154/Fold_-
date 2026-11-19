/**
 * 简单内存限流（阶段 0）
 * 适用：登录、push、AI 接口等写操作
 * 说明：内存实现，进程重启即清零——阶段 0 够用；单机单用户场景足够
 * TODO: 阶段 1 起按实际需要换成 SQLite 持久化限流
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 返回 true = 放行；false = 超限 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** 从请求提取限流键（IP 或全局） */
export function clientKey(req: Request, scope: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  return `${scope}:${ip}`;
}
