"use client";

/**
 * 「一句话改设置」共用组件（三期 C3 第 2 轮 · L1 通道）
 *
 * 管家 = 懂接口的人，用来替代手动改那些复杂配置。
 * - 你说一句话 → 出一份**逐条改动草案**（改哪项 / 现在是什么 / 改成什么 / 影响什么 / 为什么）
 * - 逐条看、改、勾选 → 校验 → 确认后才生效；**AI 绝不直接落库**
 * - 草案只存在当前页面 state，刷新即丢；不存成待审批提案、不发站内消息
 * - 模型不可用 / 余额不足如实标注、草案留空，可直接「手动加一条」完成改动，不 mock 假装成功
 * - 所有纯写死开关原样保留；本组件只是额外的一条通道
 * - 改动历史 + 一键回滚：每次生效记一条，撤销再记一条新历史
 */
import { useCallback, useEffect, useState } from "react";

interface Def { key: string; label: string; desc: string; impact: string; ai: boolean; simple: boolean; }
interface DraftItem {
  key: string; label: string; current: unknown; proposed: unknown;
  impact: string; reason: string; valid: boolean; blocked: boolean;
  errors: string[]; enabled: boolean;
}
interface Hist {
  id: string; at: string; key: string; before: unknown; after: unknown;
  source: string; note: string;
}

interface Props { title?: string; hint?: string; onApplied?: () => void; }

function brief(v: unknown): string {
  if (v === null || v === undefined) return "—";
  try {
    const s = JSON.stringify(v);
    if (s.length <= 200) return s;
    if (Array.isArray(v)) return `数组（${v.length} 项）：${v.slice(0, 3).map((x) => typeof x === "object" ? "…" : String(x)).join("、")}…`;
    return `${s.slice(0, 180)}…`;
  } catch { return String(v); }
}

export default function AiSettingsBox({ title = "用一句话改设置", hint, onApplied }: Props) {
  const [defs, setDefs] = useState<Def[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<Hist[]>([]);
  const [text, setText] = useState("");
  const [noModel, setNoModel] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [manualKey, setManualKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/settings").then((r) => r.json()).catch(() => null);
    if (!d) return;
    setDefs(d.catalog ?? []); setValues(d.values ?? {}); setHistory(d.history ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  function patch(idx: number, p: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...p } : it));
  }

  async function draft() {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true); setError(null); setNotice(null); setItems([]); setEdits({});
    const res = await fetch("/api/settings/draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, useAi: !noModel }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!res?.ok) { setError(d.error ?? `生成失败(${res?.status ?? "网络错误"})`); return; }
    if (!d.ok) { setError(d.error ?? "未生成草案"); return; }
    setItems(d.items ?? []);
    if (!(d.items ?? []).length) setNotice("管家没有给出改动；也可以点「手动加一条」自己填");
  }

  function addManual() {
    const key = manualKey || defs[0]?.key;
    if (!key) return;
    const def = defs.find((d) => d.key === key);
    setItems((prev) => [...prev, {
      key, label: def?.label ?? key, current: values[key], proposed: values[key],
      impact: def?.impact ?? "", reason: "手动添加（不调用模型）",
      valid: true, blocked: false, errors: [], enabled: true,
    }]);
    setError(null);
  }

  function proposedFor(idx: number): unknown {
    const raw = edits[idx];
    if (raw === undefined) return items[idx]?.proposed;
    try { return JSON.parse(raw) as unknown; } catch { return items[idx]?.proposed; }
  }

  async function apply() {
    setError(null); setNotice(null);
    const picked = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.enabled && !it.blocked);
    if (!picked.length) { setError("没有勾选任何改动"); return; }
    const changes: { key: string; value: unknown; enabled: boolean }[] = [];
    for (const { it, idx } of picked) {
      let value = it.proposed;
      if (edits[idx] !== undefined) {
        try { value = JSON.parse(edits[idx]) as unknown; }
        catch { setError(`${it.label}：填写的 JSON 不合法`); return; }
      }
      changes.push({ key: it.key, value, enabled: true });
    }
    setBusy(true);
    const res = await fetch("/api/settings/apply", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: changes, source: "ai:confirm" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!res?.ok) {
      const detail = Array.isArray(d.errors)
        ? d.errors.map((e: { key: string; errors: string[] }) => `${e.key}: ${e.errors.join("；")}`).join(" | ") : "";
      setError(`${d.error ?? "应用失败"}${detail ? `（${detail}）` : ""}`);
      return;
    }
    setNotice(`已生效：${(d.applied ?? []).join("、")}（改动历史已记录）`);
    setItems([]); setEdits({}); setText("");
    await load(); onApplied?.();
  }

  async function revert(h: Hist, confirm = false): Promise<void> {
    setError(null);
    const res = await fetch("/api/settings/revert", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: h.id, confirm }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    if (res?.status === 409 && d.needsConfirm) {
      if (window.confirm(d.message ?? "将覆盖较新的值，继续？")) return revert(h, true);
      return;
    }
    if (!res?.ok) { setError(d.error ?? "回滚失败"); return; }
    setNotice("已撤销，这次撤销也记进历史了");
    await load(); onApplied?.();
  }

  return (
    <div className="panel as">
      <div className="as-head">
        <div>
          <h3 className="iv-title">{title}</h3>
          <p className="muted">
            {hint ?? "管家懂网站的接口，复杂的配置交给它说一句话就行。确认前绝不生效，模型不可用也可以手动填。"}
          </p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="as-input-row">
        <textarea className="input as-input" rows={2} value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例如：把 PDF 也改成用系统应用打开、关掉 git 提交这个周报数据源" />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={draft}>
          {busy ? "处理中…" : "生成改动草案"}
        </button>
      </div>
      <label className="as-nomodel muted">
        <input type="checkbox" checked={noModel} onChange={(e) => setNoModel(e.target.checked)} />
        本次不调用模型（直接手动填，用于模型不可用或不想等）
      </label>

      {items.length > 0 && (
        <div className="as-draft">
          <h3 className="iv-title">改动草案（{items.length}）· 只在本页，刷新即丢</h3>
          {items.map((it, idx) => (
            <div key={`${it.key}-${idx}`}
              className={`as-item ${it.blocked ? "as-blocked" : ""} ${!it.valid ? "as-invalid" : ""}`}>
              <div className="as-item-head">
                <label className="as-check">
                  <input type="checkbox" checked={it.enabled && !it.blocked && it.valid}
                    disabled={it.blocked || !it.valid}
                    onChange={(e) => patch(idx, { enabled: e.target.checked })} />
                </label>
                <strong>{it.label}</strong>
                <span className="muted">#{it.key}</span>
                {it.blocked && <span className="tag">已拦截</span>}
                {!it.blocked && !it.valid && <span className="tag">校验不通过</span>}
              </div>
              <div className="as-diff">
                <div><span className="muted">现在：</span><code>{brief(it.current)}</code></div>
                <div><span className="muted">改成：</span><code>{brief(proposedFor(idx))}</code></div>
              </div>
              {it.reason && <p className="muted">理由：{it.reason}</p>}
              {it.impact && <p className="muted">影响：{it.impact}</p>}
              {it.errors.length > 0 && <p className="form-error">{it.errors.join("；")}</p>}
              {!it.blocked && (
                <details className="as-edit">
                  <summary>手动编辑这一项的完整值（JSON）</summary>
                  <textarea className="input as-json" rows={6}
                    value={edits[idx] ?? JSON.stringify(it.proposed ?? {}, null, 2)}
                    onChange={(e) => setEdits((d) => ({ ...d, [idx]: e.target.value }))} />
                </details>
              )}
            </div>
          ))}
          <div className="as-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={apply}>确认应用勾选项</button>
            <button type="button" className="btn btn-sm" onClick={() => { setItems([]); setEdits({}); }}>清空草案</button>
          </div>
        </div>
      )}

      <div className="as-manual">
        <select className="input" value={manualKey} onChange={(e) => setManualKey(e.target.value)} aria-label="手动添加设置项">
          <option value="">手动加一条…</option>
          {defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <button type="button" className="btn btn-sm" disabled={!defs.length} onClick={addManual}>手动加一条</button>
        <span className="muted">（不调用模型，自己编辑 JSON 后确认应用）</span>
      </div>

      <div className="as-history">
        <div className="as-history-head">
          <h3 className="iv-title">改动历史</h3>
          <button type="button" className="btn btn-sm" onClick={load}>刷新</button>
        </div>
        {history.length === 0 ? <p className="muted">还没有改动记录。</p> : (
          <div className="as-hist-list">
            {history.map((h) => (
              <div className="as-hist-row" key={h.id}>
                <div className="as-hist-main">
                  <strong>{defs.find((d) => d.key === h.key)?.label ?? h.key}</strong>
                  <span className="muted">{h.at.slice(0, 16).replace("T", " ")} · 来源 {h.source} {h.note}</span>
                  <span className="muted as-hist-diff">{brief(h.before)} → {brief(h.after)}</span>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => void revert(h)}>撤销</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
