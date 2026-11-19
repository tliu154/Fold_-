"use client";

/**
 * 登录页（阶段 0 实做）
 * 单用户密码登录 → POST /api/auth/login → 跳转首页
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        return;
      }
      router.replace("/");
    } catch {
      setError("网络错误，请检查服务是否在运行");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card panel">
        <h1 className="login-title">归匣</h1>
        <p className="login-sub">Fold_ · Local-First 个人中枢平台</p>
        <form onSubmit={handleSubmit}>
          <input
            className="input"
            type="password"
            placeholder="登录密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
          />
          <button
            className="btn btn-primary login-submit"
            type="submit"
            disabled={loading || password.length === 0}
          >
            {loading ? "登录中…" : "登录"}
          </button>
          {error && <p className="login-error">{error}</p>}
        </form>
        <p className="login-footnote">阶段 0：仅框架与占位，业务功能待逐个澄清</p>
      </div>
    </main>
  );
}
