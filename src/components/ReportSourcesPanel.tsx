"use client";

/**
 * 周报数据源开关面板（三期 C3）
 * - 6 类候选源，勾选哪些才把数据填进周报；站内源与 Qwen 资讯不混
 * - 手动重点：你手填，原样进周报「五、手动重点」，不经过 AI
 * - 纯写死开关（布尔/枚举点一下比说一句话快）；AI 设置通道留第 2 轮
 */
import { useCallback, useEffect, useState } from "react";

interface CatalogItem { id: string; label: string; desc: string }
interface Config {
  version: 1;
  enabled: Record<string, boolean>;
  manual_highlights: string[];
  updated_at: string | null;
}

export default function ReportSourcesPanel() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [highlights, setHighlights] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports/sources").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json().catch(() => ({}));
    setCatalog((d.catalog ?? []) as CatalogItem[]);
    const cfg = (d.config ?? {}) as Partial<Config>;
    setEnabled(cfg.enabled ?? {});
    setHighlights(cfg.manual_highlights ?? []);
    setDraft(cfg.manual_highlights ?? []);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setEnabled((e) => ({ ...e, [id]: !e[id] }));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/reports/sources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        manual_highlights: draft.map((s) => s.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    if (!res?.ok) setNotice(`保存失败：${d.error ?? "未知错误"}`);
    else {
      setNotice("已保存。下次生成周报时按勾选源填数。");
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="srcs panel">
      <div className="srcs-head">
        <h3 className="srcs-title">周报数据源开关</h3>
        <span className="muted">只把勾选的源填进周报；AI 只写评述，不生成数字</span>
      </div>

      <div className="srcs-list">
        {catalog.map((s) => (
          <label key={s.id} className="srcs-row">
            <input type="checkbox" checked={enabled[s.id] === true} onChange={() => toggle(s.id)} />
            <span className="srcs-label">{s.label}</span>
            <span className="muted srcs-desc">{s.desc}</span>
          </label>
        ))}
      </div>

      <div className="srcs-manual">
        <div className="srcs-head">
          <h3 className="srcs-title">手动重点</h3>
          <span className="muted">一行一条，原样进周报，不经过 AI</span>
        </div>
        <textarea
          className="input srcs-textarea"
          value={draft.join("\n")}
          rows={4}
          placeholder={"例如：\n完成 PRD 定稿\n把周报落点改成内部库"}
          onChange={(e) => { setDraft(e.target.value.split("\n")); setDirty(true); }}
        />
        <p className="muted">当前已保存 {highlights.length} 条。</p>
      </div>

      <div className="srcs-actions">
        <button type="button" className="btn" onClick={save} disabled={busy || !dirty}>
          {busy ? "保存中…" : "保存设置"}
        </button>
        <button type="button" className="btn btn-sm" onClick={load}>重新载入</button>
        {notice && <span className="form-notice">{notice}</span>}
      </div>
    </div>
  );
}
