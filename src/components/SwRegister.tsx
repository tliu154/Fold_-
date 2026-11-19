"use client";

/**
 * Service Worker 注册（PWA 壳）
 * 仅生产环境注册，开发时不缓存，避免干扰调试
 */
import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW 注册失败（不影响其他功能）:", err);
    });
  }, []);

  return null;
}
