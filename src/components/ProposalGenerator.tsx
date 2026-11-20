"use client";

/**
 * 整理提案生成器（三期 C2）
 * 知识库页与站内消息页共用同一份：
 * 点「生成提案预览」→ POST /api/proposals（纯读 + 一次 AI 批量建议，**不落库**）
 * → 展示逐条清单与 AI 状态 → 点「保存为提案并通知」才 POST /api/proposals/save 落库并发站内消息。
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface PreviewItem {
  from: string; to: string; filename: string; dir: string;
  title: string; tags: string[]; actions: string[];
  enabled: boolean; ai_suggested: boolean;
}
interface Preview {
  inbox: string; root: string;
  counts: { candidates: number; weak: number; ai_applied: number };
  ai_used: boolean; ai_failed: string | null;
  items: PreviewItem[]; generated_at: string;
}

export default function ProposalGenerator({
  onSaved, onClose, autoOpen = false,
}: { onSaved?: () => void; onClose?: () => void; autoOpen?: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const autoDone = useRef(false);

  const generate = useCallback(async () => {
    setBusy(true); setError(null); setNotice(null); setPreview(null);
    const res = await fetch("/api/proposals", { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res) { setError("请求失败，请检查服务是否在线"); return; }
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "生成失败"); return; }
    setPreview(d.preview as Preview);
  }, []);

  useEffect(() => {
    if (autoOpen && !autoDone.current) {
      autoDone.current = true;
      void generate();
    }
  }, [autoOpen, generate]);

  async function save() {
    if (!preview) return;
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/proposals/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: preview.items.map((i) => ({
          from: i.from, dir: i.dir, filename: i.filename, title: i.title,
          tags: i.tags, enabled: i.enabled, ai_suggested: i.ai_suggested,
        })),
        ai_used: preview.ai_used,
        ai_failed: preview.ai_failed,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res) { setError("请求失败，请检查服务是否在线"); return; }
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "保存失败"); return; }
    if (d.duplicated) {
      setNotice("这些文件已有待审批提案，未重复生成（不重复通知）。");
    } else {
      setNotice(`已保存提案（${d.proposal?.items?.length ?? 0} 个文件）并发站内消息，请到「站内消息 → 待审批提案」批准。`);
    }
    setPreview(null);
    onSaved?.();
  }

  return (
    <div className="prop-gen">
      <div className="prop-gen-bar">
        <div className="muted">
          生成<strong>变更提案</strong>：AI 只补缺标签的文件，已合规标签沿用规则；建议只用于推算目录，
          <strong>不会写进 frontmatter</strong>。预览不落库，保存后才会通知你审批。
        </div>
        <button type="button" className="btn btn-sm" onClick={generate} disabled={busy}>
          {busy ? "处理中…" : "生成提案预览"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      {preview && (
        <div className="prop-gen-preview">
          <h3 className="settings-h2">提案预览（保存前不会写任何文件）</h3>
          <p className="muted">
            候选 {preview.counts.candidates} 个 · 缺标签 {preview.counts.weak} 个 · AI 建议生效 {preview.counts.ai_applied} 个
            {preview.ai_used ? "（本次调用了模型）" : "（本次未调用模型）"}
          </p>
          {preview.ai_failed && (
            <p className="form-error">
              AI 建议未生效：{preview.ai_failed} —— 已如实降级为纯规则提案，不假装成功。
            </p>
          )}
          {preview.items.length === 0 ? (
            <p className="muted">没有需要整理的新文件。</p>
          ) : (
            <div className="prop-gen-list">
              {preview.items.map((i) => (
                <div key={i.from} className="prop-gen-row">
                  <div className="prop-gen-main">
                    <strong>{i.filename}</strong>
                    <div className="muted">
                      → {i.dir}
                      {i.tags.length > 0 && ` · ${i.tags.map((t) => `#${t}`).join(" ")}`}
                      {i.ai_suggested && " · AI 建议"}
                    </div>
                    <code className="muted lib-file-path">{i.from}</code>
                  </div>
                  <div className="capture-item-tags">
                    {i.actions.map((a) => <span key={a} className="tag">{a}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={save}
              disabled={busy || preview.items.length === 0}>
              {busy ? "保存中…" : `保存为提案并通知（${preview.items.length}）`}
            </button>
            <button type="button" className="btn" onClick={() => { setPreview(null); onClose?.(); }} disabled={busy}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
