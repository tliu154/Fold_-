"use client";

/**
 * 设置页「笔记索引」区（一期 A8）
 * - 白名单目录增删（存 data/index-config.json）
 * - 手动刷新按钮（不做自动监听）；显示条目数 / 最后刷新时间
 * - 检索预览：关键词或标签试搜，验证索引效果
 */
import { useCallback, useEffect, useState } from "react";

export default function IndexSettings() {
  const [status, setStatus] = useState<{ count: number; builtAt: string | null; dirs: string[] } | null>(null);
  const [newDir, setNewDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ path: string; title: string; tags: string[]; mtime: string }[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/index").catch(() => null);
    if (res?.status === 401) { window.location.href = "/login"; return; }
    const d = res ? await res.json().catch(() => ({})) : {};
    setStatus(d.count !== undefined ? d : null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function refresh() {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/index", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "刷新失败"); return; }
    setStatus(d); setNotice(`已重建索引：${d.count} 条`);
  }

  async function saveDirs(dirs: string[]) {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/index", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirs }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "保存失败（目录不存在或不可读时仍会保存，条目数为 0）"); return; }
    setStatus(d); setNotice(`白名单已保存，索引重建：${d.count} 条`);
  }

  async function preview() {
    setError(null);
    const params = new URLSearchParams();
    if (q.trim().startsWith("#")) params.set("tag", q.trim().slice(1));
    else params.set("q", q.trim());
    const res = await fetch(`/api/index/search?${params.toString()}`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "搜索失败"); return; }
    setResults(d.results ?? []);
  }

  const dirs = status?.dirs ?? [];

  return (
    <div className="panel settings-block index-block">
      <div className="memory-head">
        <h2 className="settings-h2">笔记索引（检索工具）</h2>
        <div className="memory-head-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={refresh} disabled={busy}>
            {busy ? "处理中…" : "手动刷新"}
          </button>
        </div>
      </div>
      <p className="muted">
        只索引 .md 的元数据（路径/标题/标签/修改时间），不读正文；AI 对话的普通模式可自动调用
        search_notes / get_note / stats 查询。不做自动监听，笔记变动后点「手动刷新」。
      </p>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="index-stats">
        <span>索引条目：<strong>{status?.count ?? "…"}</strong></span>
        <span className="muted">最后刷新：{status?.builtAt ? new Date(status.builtAt).toLocaleString("zh-CN") : "未构建"}</span>
      </div>

      <h3 className="memory-subtitle">白名单目录（{dirs.length} 个）</h3>
      <ul className="index-dirs">
        {dirs.map((d) => (
          <li key={d} className="index-dir-row">
            <code className="index-dir-path">{d}</code>
            <button type="button" className="btn btn-sm" disabled={busy || dirs.length <= 1}
              onClick={() => saveDirs(dirs.filter((x) => x !== d))}>移除</button>
          </li>
        ))}
      </ul>
      <div className="todo-form-row">
        <input className="input" placeholder="新增目录绝对路径，如 D:\我的知识库" value={newDir}
          onChange={(e) => setNewDir(e.target.value)} />
        <button type="button" className="btn btn-primary" disabled={busy || !newDir.trim()}
          onClick={() => { saveDirs([...dirs, newDir.trim()]); setNewDir(""); }}>添加</button>
      </div>

      <h3 className="memory-subtitle">检索预览</h3>
      <div className="todo-form-row">
        <input className="input" placeholder="关键词，或 #标签" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") preview(); }} />
        <button type="button" className="btn" onClick={preview} disabled={!q.trim()}>搜索</button>
      </div>
      {results !== null && (
        results.length === 0 ? <p className="muted">无匹配结果</p> : (
          <ul className="index-results">
            {results.map((r) => (
              <li key={r.path} className="index-result-row">
                <span className="index-result-title">{r.title}</span>
                <code className="muted index-result-path">{r.path}</code>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
