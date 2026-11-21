/* Fold_归匣 Service Worker（阶段 0 · 最小 PWA 壳）
   规则（2026-11-21 修订，见 PRD §6.3）：
   - 只缓存**永不随构建变化**的静态壳资源：/icon.svg、/manifest.json
   - 首页 HTML（导航请求）、/login、/_next/* 一律**走网络、绝不缓存**
     原因：dev 与生产 build 共用同一个 .next，资源 URL 会在「带 hash」与「?v=时间戳」之间切换；
     旧版曾 cache-first 缓存 HTML，把页面锁死在旧快照，导致样式全丢 + JS 不 hydrate + 卡「载入中…」
   - API 一律走网络、绝不缓存；不缓存任何用户数据；移动端权威数据在笔记本主库
*/
const CACHE = "fold-shell-v2";
const SHELL_ASSETS = ["/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // API 请求不拦截、不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 非 GET 不处理
  if (req.method !== "GET") return;

  // 页面导航 / RSC / Next 构建产物：绝不缓存，直接走网络。
  // 这些 URL 会随 dev 与生产 build 切换而变化，缓存必然导致资源错配。
  if (req.mode === "navigate" || url.pathname.startsWith("/_next/") || url.pathname === "/login") {
    return;
  }

  // 仅 icon / manifest 这类稳定静态壳资源用 cache-first
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
