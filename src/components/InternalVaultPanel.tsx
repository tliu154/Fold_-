"use client";

/**
 * 内部库整理面板（三期 C3）
 * - 列出内部库未分类区的**全格式**文件与逐条整理建议（纯规则，不调模型）
 * - 逐条勾选 / 改目录 / 改文件名 → 保存为提案（发站内轻通知）→ 批准后
 *   才从内部库移动到用户加入的库（开发阶段 = 测试库），一次批准一次 commit
 * - HTML 等格式只登记外部元数据、不动内容；.md 才可能补 frontmatter
 */
import { useCallback, useEffect, useState } from "react";

interface FilingItem {
  from: string; file_id: string; filename: string; dir: string; title: string;
  tags: string[]; ext: string; subtype: string; actions: string[];
  enabled: boolean; rule: string; note: string; reason?: string;
}
interface Proposal {
  id: string; status: string; items: FilingItem[]; commit: string | null;
  counts: { total: number; enabled: number; skipped: number };
  created_at: string;
}
interface Preview {
  unsorted: string; root: string;
  allowedDirs: string[];
  counts: { total: number; ready: number; skipped: number };
  items: FilingItem[];
  pending: number;
}

export default function InternalVaultPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, FilingItem[]>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/internal-files").then((r) => r.json()).catch(() => null),
      fetch("/api/filing").then((r) => r.json()).catch(() => null),
    ]);
    if (a?.preview) setPreview(a.preview as Preview);
    setProposals((b?.proposals ?? []) as Proposal[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  function itemsOf(p: Proposal): FilingItem[] {
    return drafts[p.id] ?? p.items;
  }
  function patchItem(p: Proposal, idx: number, patch: Partial<FilingItem>) {
    const list = itemsOf(p).map((it, i) => i === idx ? { ...it, ...patch } : it);
    setDrafts((d) => ({ ...d, [p.id]: list }));
  }

  async function call(url: string, init: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    if (!res?.ok) throw new Error(d.error ?? `请求失败(${res?.status ?? "网络错误"})`);
    return d;
  }

  async function saveProposal() {
    if (!preview) return;
    setBusy(true); setNotice(null);
    try {
      const d = await call("/api/filing", {
        method: "POST",
        body: JSON.stringify({ items: preview.items, source: `manual:${Date.now()}` }),
      });
      setNotice(d.duplicated ? "这些文件已有待审批提案，未重复创建。" : "提案已保存，并投递到站内消息。");
      await load();
    } catch (e) { setNotice(`保存失败：${(e as Error).message}`); }
    setBusy(false);
  }

  async function saveEdits(p: Proposal) {
    const list = drafts[p.id];
    if (!list) return true;
    try {
      await call(`/api/filing/${encodeURIComponent(p.id)}`, {
        method: "PATCH", body: JSON.stringify({ items: list }),
      });
      setDrafts((d) => { const n = { ...d }; delete n[p.id]; return n; });
      return true;
    } catch (e) { setNotice(`保存修改失败：${(e as Error).message}`); return false; }
  }

  async function approve(p: Proposal) {
    if (!await saveEdits(p)) return;
    const enabled = itemsOf(p).filter((i) => i.enabled).length;
    if (!window.confirm(
      `确认批准？将按勾选的 ${enabled} 个条目把文件从内部库移动到用户加入的库，`
      + "并做一次 git commit（可用 commit 回滚）。"
    )) return;
    setBusy(true); setNotice(null);
    try {
      const d = await call(`/api/filing/${encodeURIComponent(p.id)}/approve`, { method: "POST" });
      setNotice(`已整理 ${d.result?.count ?? 0} 个文件，commit ${d.result?.commit ?? "—"}。`);
      await load();
    } catch (e) { setNotice(`批准失败：${(e as Error).message}`); }
    setBusy(false);
  }

  async function reject(p: Proposal) {
    setBusy(true);
    try {
      await call(`/api/filing/${encodeURIComponent(p.id)}`, {
        method: "PATCH", body: JSON.stringify({ status: "rejected" }),
      });
      setNotice("已驳回，不改动任何文件。");
      await load();
    } catch (e) { setNotice(`驳回失败：${(e as Error).message}`); }
    setBusy(false);
  }

  async function remove(p: Proposal) {
    setBusy(true);
    try {
      await call(`/api/filing/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      await load();
    } catch (e) { setNotice(`删除失败：${(e as Error).message}`); }
    setBusy(false);
  }

  return (
    <div className="iv panel">
      <div className="iv-head">
        <div>
          <h3 className="iv-title">内部库 · 未分类区</h3>
          <p className="muted">
            所有新增文件（不限格式，含 HTML 周报）先落这里；整理批准后才分流到用户加入的库。
            {preview && `目标库：${preview.root}`}
          </p>
        </div>
        <div className="iv-actions">
          <button type="button" className="btn btn-sm" onClick={load}>刷新</button>
          <button type="button" className="btn" onClick={saveProposal} disabled={busy || !preview || preview.counts.ready === 0}>
            {busy ? "处理中…" : "生成整理提案"}
          </button>
        </div>
      </div>

      {notice && <p className="form-notice">{notice}</p>}

      {preview ? (
        <div className="iv-preview">
          <p className="muted">
            扫描到 {preview.counts.total} 个文件（可整理 {preview.counts.ready} / 跳过 {preview.counts.skipped}）。
            规则：Markdown 补标题标签；其它格式只读元数据、不改内容。
          </p>
          {preview.items.length > 0 && (
            <div className="iv-list">
              {preview.items.map((it, i) => (
                <div className="iv-row" key={`${it.from}-${i}`}>
                  <span className="iv-row-main">
                    <span className="home-item-title">{it.filename}</span>
                    <span className="muted home-item-meta">
                      {it.rule} · {it.subtype} · → {it.dir}/ · {it.actions.join("+")}
                      {!it.enabled && <span className="tag">跳过：{it.reason}</span>}
                    </span>
                  </span>
                  <span className="muted iv-note">{it.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : <p className="muted">载入中…</p>}

      <h3 className="iv-title">整理提案（{proposals.length}）</h3>
      {proposals.length === 0 ? <p className="muted">还没有提案。点上方「生成整理提案」创建。</p> : (
        <div className="iv-proposals">
          {proposals.map((p) => (
            <div className="iv-proposal" key={p.id}>
              <div className="prop-head">
                <span className="home-item-title">
                  提案 {p.created_at.slice(0, 16).replace("T", " ")} · {p.status}
                </span>
                <span className="muted">{p.counts.total} 条{p.commit && ` · commit ${p.commit}`}</span>
              </div>
              <div className="iv-list">
                {itemsOf(p).map((it, i) => (
                  <div className="iv-row" key={`${it.from}-${i}`}>
                    <label className="iv-check">
                      <input type="checkbox" checked={it.enabled}
                        disabled={p.status !== "pending"}
                        onChange={(e) => patchItem(p, i, { enabled: e.target.checked })} />
                    </label>
                    <div className="iv-row-main">
                      <span className="home-item-title">{it.title}</span>
                      <span className="muted home-item-meta">{it.filename.split("/").pop()}</span>
                      {p.status === "pending" && (
                        <div className="iv-edit">
                          <select className="input" value={it.dir}
                            onChange={(e) => patchItem(p, i, { dir: e.target.value })}>
                            {(preview?.allowedDirs ?? [it.dir]).map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <input className="input" value={it.filename}
                            onChange={(e) => patchItem(p, i, { filename: e.target.value })} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {p.status === "pending" && (
                <div className="prop-toolbar">
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => saveEdits(p)}>保存修改</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => approve(p)}>批准并整理</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => reject(p)}>驳回</button>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => remove(p)}>删除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
