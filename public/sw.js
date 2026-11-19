/* Fold_归匣 Service Worker（阶段 0 · 最小 PWA 壳）
   规则：
   - 只缓存静态壳资源（页面/样式/图标），API 一律走网络、绝不缓存
   - 不缓存任何用户数据；移动端权威数据在笔记本主库，本地缓存由应用层管理
*/
const CACHE = "fold-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/login", "/manifest.json", "/icon.svg"]))
  );
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
  const url = new URL(event.request.url);

  // API 请求不拦截、不缓存
  if (url.pathname.startsWith("/api/")) return;

  // 非 GET 不处理
  if (event.request.method !== "GET") return;

  // 静态壳资源：cache-first
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
    )
  );
});
