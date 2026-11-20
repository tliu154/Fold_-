"use client";

/**
 * 待审批提案面板（三期 C2）
 * 列表 / 逐条勾选与编辑（目标目录、文件名）/ 保存修改 / 批准并执行 / 驳回 / 删除留档。
 * 批准后复用 B3 执行引擎：一次批准 = 一次 git commit，页面展示 commit hash 与跳过原因。
 */
import { useCallback, useEffect, useState } from "react";
import ProposalGenerator from "./ProposalGenerator";

interface ProposalItem {
  from: string; to: string; filename: string; dir: string;
  title: string; tags: string[]; actions: string[];
  enabled: boolean; ai_suggested: boolean; reason?: string;
}
interface Proposal {
  id: string; status: "pending" | "approved" | "rejected" | "stale";
  title: string; source: string; ai_used: boolean; ai_failed: string | null;
  inbox: string; root: string; items: ProposalItem[];
  decided_at: string | null; commit: string | null; message: string | null;
  created_at: string; updated_at: string;
}
interface ApproveResult {
  ok: true; commit: string; count: number; message: string;
  moved: { from: string; to: string }[];
  skipped: { path: string; reason: string }[];
}

const STATUS_LABEL: Record<Proposal["status"], string> = {
  pending: "待审批", approved: "已批准", rejected: "已驳回", stale: "已失效",
};

function fmt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function basename(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

export default function ProposalPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProposalItem[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ id: string; result: ApproveResult } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/proposals").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setProposals(d.proposals ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setExpanded((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }
  function itemsOf(p: Proposal): ProposalItem[] {
    return drafts[p.id] ?? p.items;
  }
  function editItem(p: Proposal, idx: number, patch: Partial<ProposalItem>) {
    const next = itemsOf(p).map((it, i) => i === idx ? { ...it, ...patch } : it);
    setDrafts((d) => ({ ...d, [p.id]: next }));
  }

  async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(url, init).catch(() => null);
    if (!res) return { ok: false, data: { error: "请求失败，请检查服务是否在线" } };
    const data = await res.json();
    return { ok: res.ok, data };
  }

  async function saveEdits(p: Proposal) {
    setBusy(p.id); setError(null); setNotice(null);
    const r = await call(`/api/proposals/${encodeURIComponent(p.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: itemsOf(p).map((i) => ({
        from: i.from, dir: i.dir, filename: i.filename, title: i.title,
        tags: i.tags, enabled: i.enabled, ai_suggested: i.ai_suggested,
      })) }),
    });
    setBusy(null);
    if (!r.ok) { setError(String(r.data.error ?? "保存失败")); return; }
    setNotice("修改已保存");
    setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n; });
    load();
  }

  async function approve(p: Proposal) {
    // 有未保存的编辑先一并提交，避免"改了但没生效"的困惑
    if (drafts[p.id]) {
      const s = await call(`/api/proposals/${encodeURIComponent(p.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsOf(p).map((i) => ({
          from: i.from, dir: i.dir, filename: i.filename, title: i.title,
          tags: i.tags, enabled: i.enabled, ai_suggested: i.ai_suggested,
        })) }),
      });
      if (!s.ok) { setError(String(s.data.error ?? "保存修改失败")); return; }
    }
    const enabled = itemsOf(p).filter((i) => i.enabled).length;
    if (!window.confirm(`确认批准并执行？将按勾选的 ${enabled} 个条目移动/重命名文件，并做一次 git commit（可用 commit 回滚）。`)) return;
    setBusy(p.id); setError(null); setNotice(null);
    const r = await call(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { method: "POST" });
    setBusy(null);
    if (!r.ok) { setError(String(r.data.error ?? "执行失败（提案保持待审批，可重试）")); return; }
    setLastResult({ id: p.id, result: r.data.result as ApproveResult });
    setNotice("已批准并执行");
    setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n; });
    load();
  }

  async function reject(p: Proposal) {
    setBusy(p.id); setError(null); setNotice(null);
    const r = await call(`/api/proposals/${encodeURIComponent(p.id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    setBusy(null);
    if (!r.ok) { setError(String(r.data.error ?? "驳回失败")); return; }
    setNotice("已驳回，未改动任何文件");
    load();
  }

  async function remove(p: Proposal) {
    setBusy(p.id); setError(null); setNotice(null);
    const r = await call(`/api/proposals/${encodeURIComponent(p.id)}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) { setError(String(r.data.error ?? "删除失败")); return; }
    load();
  }

  const shown = filter === "pending" ? proposals.filter((p) => p.status === "pending") : proposals;

  return (
    <div className="panel prop-block">
      <div className="prop-head">
        <h2 className="settings-h2">待审批提案</h2>
        <span className="muted">AI 出提案 → 站内消息通知 → 你批准后才动文件</span>
      </div>

      <ProposalGenerator onSaved={load} />

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="prop-toolbar">
        <div className="seg">
          <button type="button" className={`seg-btn ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>
            待审批 {proposals.filter((p) => p.status === "pending").length}
          </button>
          <button type="button" className={`seg-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>全部（含留档）</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">暂无待审批提案。点上方「生成提案预览」，或等定时任务自动生成。</div>
      ) : (
        <div className="prop-list">
          {shown.map((p) => {
            const open = expanded.includes(p.id);
            const items = itemsOf(p);
            const dirty = Boolean(drafts[p.id]);
            const result = lastResult?.id === p.id ? lastResult.result : null;
            return (
              <div key={p.id} className={`prop-row ${p.status}`}>
                <div className="prop-row-main">
                  <button type="button" className="msg-title" onClick={() => toggle(p.id)}>
                    {p.status === "pending" && <span className="msg-dot" />}{p.title}
                  </button>
                  <div className="msg-meta">
                    <span className={`tag ${p.status === "pending" ? "" : "tag-off"}`}>{STATUS_LABEL[p.status]}</span>
                    <span className="muted">{fmt(p.created_at)}</span>
                    <span className="muted">{p.ai_used ? "含 AI 建议" : "纯规则"}</span>
                    {p.commit && <span className="muted">commit {p.commit}</span>}
                  </div>
                  {p.ai_failed && <div className="muted">AI 未生效：{p.ai_failed}（已降级为规则提案）</div>}
                </div>

                {open && (
                  <div className="prop-detail">
                    <p className="muted">
                      目录 {p.inbox} → {p.root}。可逐条勾选、改目标目录与文件名；路径由服务端重算，越界会被拒绝。
                    </p>
                    {items.length === 0 ? <p className="muted">没有条目。</p> : (
                      <div className="prop-items">
                        {items.map((it, idx) => (
                          <div key={it.from} className={`prop-item ${it.enabled ? "" : "off"}`}>
                            <label className="prop-check">
                              <input type="checkbox" checked={it.enabled}
                                disabled={p.status !== "pending"}
                                onChange={(e) => editItem(p, idx, { enabled: e.target.checked })} />
                            </label>
                            <div className="prop-item-main">
                              <strong>{basename(it.from)}</strong>
                              <div className="muted">
                                {it.tags.length > 0 ? it.tags.map((t) => `#${t}`).join(" ") : "无标签"}
                                {it.ai_suggested && " · AI 建议"}
                                {it.actions.length > 0 && ` · ${it.actions.join(" / ")}`}
                              </div>
                              {it.reason && <div className="form-error">跳过：{it.reason}</div>}
                            </div>
                            {p.status === "pending" ? (
                              <div className="prop-item-edit">
                                <input className="input" aria-label="目标目录" value={it.dir}
                                  onChange={(e) => editItem(p, idx, { dir: e.target.value })} />
                                <input className="input" aria-label="文件名" value={it.filename}
                                  onChange={(e) => editItem(p, idx, { filename: e.target.value })} />
                              </div>
                            ) : (
                              <div className="muted prop-item-final">→ {it.dir}/{it.filename}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {result && (
                      <div className="prop-result">
                        已提交 git：<code>{result.commit}</code> · 实际移动 {result.count} 个文件
                        {result.skipped.length > 0 && ` · 跳过 ${result.skipped.length} 个`}
                        {result.skipped.slice(0, 3).map((s) => (
                          <div key={s.path} className="muted">跳过 {basename(s.path)}：{s.reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="msg-actions">
                  {p.status === "pending" && (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => saveEdits(p)} disabled={busy === p.id || !dirty}>保存修改</button>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => approve(p)} disabled={busy === p.id}>批准并执行</button>
                      <button type="button" className="btn btn-sm" onClick={() => reject(p)} disabled={busy === p.id}>驳回</button>
                    </>
                  )}
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(p)} disabled={busy === p.id}>删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
