"use client";

/**
 * Service Worker 注册（PWA 壳）
 * - 生产环境：注册最小离线壳（只缓存 icon / manifest，绝不缓存 HTML 与 /_next/*，见 public/sw.js）
 * - 开发环境：主动注销残留 SW 并清空缓存。
 *   原因：dev 与生产 build 共用同一个 origin（localhost:3000），生产期注册的 SW 会常驻浏览器；
 *   旧版用 cache-first 缓存首页 HTML，切到 dev 后资源 URL 形态变化，旧 HTML 引用的带 hash 资源
 *   全部 404 → 样式全丢 + JS 不 hydrate + 卡「载入中…」。见 PRD §6.3。
 */
import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => void r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        void caches.keys().then((ks) => ks.forEach((k) => void caches.delete(k))).catch(() => {});
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW 注册失败（不影响其他功能）:", err);
    });
  }, []);

  return null;
}
