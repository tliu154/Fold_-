"use client";

/**
 * 「记下来」共享面板（一期 A10）
 * - 挂 AI 对话 / 管家页：按轮次勾选（一问一答为单位）+ 记下来按钮
 * - 会话内展开待分类列表：改标题/标签 → 整理完成；导出预览 → 确认写 .md
 * - 一次点击 = 一条 items 记录；幂等；不新增表
 */
import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";

export interface ChatMsgForCapture {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

interface Captured {
  id: string;
  title: string;
  content: string;
  tags: string[];
  session_id: string;
  status: "pending" | "done";
  created_at: string;
}

interface ExportPreview {
  filename: string;
  target: string;
  content: string;
  vault: string;
  dir: string;
}

export default function CapturePanel({ sessionId, messages }: {
  sessionId: string | null;
  messages: ChatMsgForCapture[];
}) {
  const [selected, setSelected] = useState<string[]>([]); // 勾选的 user 消息 id（一轮的代表）
  const [list, setList] = useState<Captured[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<{
    title: string; tags: string[]; dialogue: string;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportPrev, setExportPrev] = useState<ExportPreview | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const [exportDir, setExportDir] = useState("");

  const loadList = useCallback(async () => {
    if (!sessionId) { setList([]); return; }
    const res = await fetch(`/api/capture/items?session_id=${encodeURIComponent(sessionId)}`).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setList(d.items ?? []);
  }, [sessionId]);

  useEffect(() => { loadList(); setSelected([]); }, [loadList]);

  // 可勾选的轮次 = 有 assistant 回复的 user 消息
  const rounds = messages.filter((m, i) =>
    m.role === "user" && typeof m.id === "string" && !m.id.startsWith("local-") &&
    messages[i + 1]?.role === "assistant"
  );

  function toggleRound(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function doPreview() {
    if (!sessionId || selected.length === 0) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/capture/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message_ids: selected }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "预览失败"); return; }
    if (d.already_saved) { setError("这批对话已记下来过，不重复保存"); return; }
    setPreview({ title: d.suggestion?.title ?? "", tags: d.suggestion?.tags ?? [], dialogue: d.dialogue });
    setTitle(d.suggestion?.title ?? "");
    setTags((d.suggestion?.tags ?? []).join(", "));
  }

  async function doSave() {
    if (!sessionId || !title.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/capture/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId, message_ids: selected, title: title.trim(),
        tags: tags.split(/[,，\s]+/).map((s) => s.trim().replace(/^#/, "")).filter(Boolean),
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "保存失败"); return; }
    setPreview(null); setSelected([]); setExpanded(true);
    setNotice("已记下来（待整理）");
    await loadList();
  }

  async function doOrganize(item: Captured) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/capture/items/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: item.title, tags: item.tags }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "整理失败"); return; }
    setNotice("已整理完成");
    await loadList();
  }

  async function doRemove(id: string) {
    const res = await fetch(`/api/capture/items/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("删除失败"); return; }
    await loadList();
  }

  async function doExportPreview(item: Captured) {
    setExportId(item.id); setExportDir(""); setError(null);
    const res = await fetch(`/api/capture/export?id=${encodeURIComponent(item.id)}`).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { setError(d.error ?? "预览失败"); setExportId(null); return; }
    setExportPrev(d as ExportPreview);
  }

  async function doExportConfirm() {
    if (!exportId) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/capture/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: exportId, dir: exportDir || undefined }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) { setError(d.error ?? "导出失败"); return; }
    setExportPrev(null); setExportId(null);
    setNotice(`已导出：${d.preview?.target ?? ""}`);
  }

  if (!sessionId) return null;

  return (
    <div className="capture-panel">
      <div className="capture-toolbar">
        <span className="muted">记下来（勾选轮次，一键存主库，绝不自动）</span>
        <div className="capture-toolbar-actions">
          <button type="button" className="btn btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "收起" : `已记下来 ${list.length} 条`}
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={doPreview}
            disabled={selected.length === 0 || busy}>记下来（{selected.length} 轮）</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      {rounds.length > 0 && !expanded && (
        <div className="capture-rounds">
          {rounds.map((m, i) => (
            <label key={m.id} className="capture-round">
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleRound(m.id)} />
              第 {i + 1} 轮：{m.content.slice(0, 40)}
            </label>
          ))}
        </div>
      )}

      {expanded && (
        <div className="capture-list">
          {list.length === 0 ? <p className="muted">本会话还没有记下来</p> : list.map((item) => (
            <div key={item.id} className="capture-item">
              <div className="capture-item-head">
                <strong>{item.title}</strong>
                <span className="tag">{item.status === "done" ? "已整理" : "待整理"}</span>
              </div>
              <div className="muted capture-item-date">{new Date(item.created_at).toLocaleString("zh-CN")}</div>
              <div className="capture-item-tags">
                {item.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
              </div>
              <div className="capture-item-actions">
                {item.status === "pending" && (
                  <button type="button" className="btn btn-sm" onClick={() => doOrganize(item)} disabled={busy}>整理完成</button>
                )}
                <button type="button" className="btn btn-sm" onClick={() => doExportPreview(item)}>导出 .md</button>
                <button type="button" className="btn btn-sm" onClick={() => doRemove(item.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <Modal title="记下来 · 确认标题与标签" onClose={() => setPreview(null)}>
          <p className="muted">AI 已生成建议，可修改后保存。保存后状态为「待整理」。</p>
          <div className="modal-form">
            <label className="modal-label">标题<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="modal-label">标签（逗号分隔）<input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
            <p className="muted">固定包含 #type/笔记 与 #source/网页AI</p>
            <details className="capture-dialogue">
              <summary>预览选中的对话</summary>
              <pre>{preview.dialogue.slice(0, 2000)}</pre>
            </details>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={doSave} disabled={busy || !title.trim()}>保存</button>
              <button type="button" className="btn" onClick={() => setPreview(null)}>取消</button>
            </div>
          </div>
        </Modal>
      )}

      {exportPrev && (
        <Modal title="导出 .md · 预览确认" onClose={() => setExportPrev(null)}>
          <p className="muted">确认后将写入知识库，不会覆盖同名文件。</p>
          <div className="modal-form">
            <label className="modal-label">目标目录（相对知识库根）<input className="input" value={exportDir || exportPrev.dir} onChange={(e) => setExportDir(e.target.value)} /></label>
            <p className="muted">知识库根：{exportPrev.vault}</p>
            <p className="muted">文件名：{exportPrev.filename}</p>
            <p className="muted">完整路径：{exportPrev.target}</p>
            <pre className="memory-preview">{exportPrev.content.slice(0, 2000)}</pre>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={doExportConfirm} disabled={busy}>确认导出</button>
              <button type="button" className="btn" onClick={() => setExportPrev(null)}>取消</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
