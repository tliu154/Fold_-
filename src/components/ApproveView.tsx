"use client";

/**
 * 审批台（阶段 1 实装，仅笔记本端）
 * - 待审批列表：逐条批准 / 驳回（可填原因），支持勾选批量批准
 * - 冲突列表：展示服务端条目 vs 移动端改动，快捷按钮
 *   「以主库为准」（驳回）/「以移动端为准」（强制应用）
 * - 批准执行顺序由服务端保证：快照 → 应用 → 审计 → version+1
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmptyState from "./EmptyState";

interface OpRow {
  op_id: string;
  device_id: string;
  type: string;
  target_id: string | null;
  item_type: string | null;
  payload: Record<string, unknown>;
  base_version: number | null;
  client_seq: number | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  target_title: string | null;
  target_deleted: boolean | null;
}

interface ConflictRow {
  op_id: string;
  device_id: string;
  type: string;
  target_id: string | null;
  item_type: string | null;
  base_version: number | null;
  created_at: string;
  client_payload: Record<string, unknown>;
  reject_reason: string | null;
  server_item: Record<string, unknown> | null;
  server_version: number;
}

export default function ApproveView() {
  const router = useRouter();
  const [ops, setOps] = useState<OpRow[] | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [dbVersion, setDbVersion] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pendingRes, conflictRes] = await Promise.all([
        fetch("/api/ops/pending?status=pending"),
        fetch("/api/ops/conflicts"),
      ]);
      if (pendingRes.status === 401 || conflictRes.status === 401) {
        router.replace("/login");
        return;
      }
      const pendingData = await pendingRes.json();
      const conflictData = await conflictRes.json();
      setOps(pendingData.ops ?? []);
      setConflicts(conflictData.conflicts ?? []);
      setDbVersion(pendingData.db_version ?? null);
      setSelected(new Set());
    } catch {
      setOps([]);
      setNote("加载失败，请检查网络");
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(url: string, body?: Record<string, unknown>): Promise<string | null> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/login");
        return "redirected";
      }
      if (!res.ok) return data.error ?? "操作失败";
      await load();
      return null;
    } catch {
      return "网络错误";
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(opId: string) {
    const err = await act(`/api/ops/${opId}/approve`);
    if (err && err !== "redirected") setNote(err);
  }

  async function handleReject(opId: string) {
    const err = await act(`/api/ops/${opId}/reject`, { reason: reasons[opId] });
    if (err && err !== "redirected") setNote(err);
  }

  async function handleResolve(opId: string, resolution: "server" | "client") {
    const err = await act(`/api/ops/${opId}/resolve`, { resolution });
    if (err && err !== "redirected") setNote(err);
  }

  async function handleBatchApprove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/ops/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op_ids: ids }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      const failed = (data.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      if (failed.length > 0) setNote(`${failed.length} 条批准失败`);
      await load();
    } catch {
      setNote("网络错误");
    } finally {
      setBusy(false);
    }
  }

  function toggle(opId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  }

  const pending = ops ?? [];

  return (
    <section>
      <h1 className="view-title">审批台</h1>
      <p className="view-desc">
        移动端提交的操作请求。批准前主库不发生任何变化 · 库版本 v{dbVersion ?? "-"}
      </p>

      <div className="approve-toolbar">
        <span className="muted">{pending.length} 条待审批</span>
        <button className="btn" type="button" onClick={load} disabled={busy}>
          刷新
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleBatchApprove}
          disabled={busy || selected.size === 0}
        >
          批量批准（已选 {selected.size}）
        </button>
      </div>
      {note && <p className="approve-note">{note}</p>}

      {ops === null ? (
        <p className="muted">载入中…</p>
      ) : pending.length === 0 ? (
        <EmptyState text="没有待审批的操作" />
      ) : (
        <ul className="approve-list">
          {pending.map((op) => (
            <li key={op.op_id} className="approve-row panel">
              <div className="approve-row-head">
                <label className="approve-check">
                  <input
                    type="checkbox"
                    checked={selected.has(op.op_id)}
                    onChange={() => toggle(op.op_id)}
                  />
                  <strong>{op.type}</strong>
                  <span className="tag">{op.item_type ?? "-"}</span>
                </label>
                <span className="muted approve-meta">
                  {op.device_id} · base v{op.base_version ?? "-"} · {op.created_at.slice(0, 19)}
                </span>
              </div>

              <div className="approve-payload">
                <OpPreview op={op} />
              </div>

              <div className="approve-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => handleApprove(op.op_id)}
                  disabled={busy}
                >
                  批准
                </button>
                <input
                  className="input approve-reason"
                  placeholder="驳回原因（可选）"
                  value={reasons[op.op_id] ?? ""}
                  onChange={(e) => setReasons((r) => ({ ...r, [op.op_id]: e.target.value }))}
                />
                <button
                  className="btn"
                  type="button"
                  onClick={() => handleReject(op.op_id)}
                  disabled={busy}
                >
                  驳回
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <>
          <h2 className="view-subtitle">冲突（{conflicts.length}）</h2>
          <p className="view-desc">base_version 过期的操作，禁止自动合并，需人工决定。</p>
          <ul className="approve-list">
            {conflicts.map((c) => (
              <li key={c.op_id} className="approve-row panel conflict-row">
                <div className="approve-row-head">
                  <strong>
                    {c.type} · {c.item_type ?? "-"}
                  </strong>
                  <span className="muted approve-meta">
                    {c.device_id} · base v{c.base_version ?? "-"} / 当前 v{c.server_version}
                  </span>
                </div>
                <div className="conflict-diff">
                  <div className="conflict-side">
                    <span className="conflict-side-label">移动端改动</span>
                    <pre>{JSON.stringify(c.client_payload, null, 2)}</pre>
                  </div>
                  <div className="conflict-side">
                    <span className="conflict-side-label">主库当前</span>
                    <pre>
                      {c.server_item
                        ? JSON.stringify(c.server_item, null, 2)
                        : "（条目不存在）"}
                    </pre>
                  </div>
                </div>
                <div className="approve-actions">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => handleResolve(c.op_id, "server")}
                    disabled={busy}
                  >
                    以主库为准
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => handleResolve(c.op_id, "client")}
                    disabled={busy}
                  >
                    以移动端为准
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function OpPreview({ op }: { op: OpRow }) {
  const p = op.payload as { title?: string; content?: string; tags?: string[] };
  return (
    <div>
      {p.title !== undefined && (
        <p>
          <span className="muted">标题：</span>
          {String(p.title)}
        </p>
      )}
      {p.content !== undefined && (
        <p>
          <span className="muted">内容：</span>
          {String(p.content).slice(0, 120)}
        </p>
      )}
      {Array.isArray(p.tags) && p.tags.length > 0 && (
        <p>
          <span className="muted">标签：</span>
          {p.tags.join(", ")}
        </p>
      )}
      {op.target_id && (
        <p className="muted">
          目标：{op.target_title ? `「${op.target_title}」` : op.target_id}
          {op.target_deleted ? "（已软删除）" : ""}
        </p>
      )}
    </div>
  );
}
