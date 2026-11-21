"use client";

/**
 * 资讯订阅面板（三期 C3 第 3 轮）：只读预览 + 手动/管家双通道 + 定时开关。
 * 绝不自动存成文件 / 进周报 / 混入站内数据源 / 自动批准发布。
 */
import { useCallback, useEffect, useState } from "react";

interface Topic { id: string; name: string; query: string; enabled: boolean; created_at: string; }
interface Schedule { enabled: boolean; time: string; last_run_date: string | null; }
interface FeedItem {
  id: string; title: string; summary: string; url: string; url_status: string;
  date: string; topic_id: string; topic_name: string; model: string;
  status: string; source: string; fetched_at: string; created_at: string;
}
interface ModelInfo {
  configured: boolean; id: string | null; base: string | null;
  capability: string; source_url_note: string;
}
interface DraftData { topics: Topic[]; schedule: Schedule; }

const STATUS_LABEL: Record<string, string> = {
  ok: "成功", model_unavailable: "模型未配置",
  ai_failed: "模型调用失败", ai_bad_output: "模型输出异常",
};

export default function NewsPanel() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [schedule, setSchedule] = useState<Schedule>({ enabled: true, time: "09:30", last_run_date: null });
  const [items, setItems] = useState<FeedItem[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nlText, setNlText] = useState("");
  const [draft, setDraft] = useState<DraftData | null>(null);
  const [draftErrors, setDraftErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Topic[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/news").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json().catch(() => ({}));
    setTopics(d.topics ?? []);
    setSchedule(d.schedule ?? { enabled: true, time: "09:30", last_run_date: null });
    setItems(d.items ?? []);
    setModel(d.model ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function doFetch(topicId?: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/news/fetch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicId ? { topicId } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? `请求失败(${res.status})`); return; }
      const results: { ok: boolean; items: unknown[]; error?: string; status: string }[] = d.results ?? [];
      const okAll = results.length > 0 && results.every((r) => r.ok);
      const st = d.status ?? "model_unavailable";
      const added = results.reduce((n, r) => n + r.items.length, 0);
      setNotice(okAll
        ? `获取完成：新增 ${added} 条资讯`
        : `未取到资讯（${STATUS_LABEL[st] ?? st}）。${results[0]?.error ?? ""}`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function saveTopics(next: Topic[], sched?: Partial<Schedule>) {
    setBusy(true); setError(null);
    try {
      const body = { topics: next, ...(sched ? { schedule: { ...schedule, ...sched } } : {}) };
      const res = await fetch("/api/news/topics", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? `保存失败(${res.status})`); return false; }
      setNotice("订阅配置已保存"); setEditing(false); setDraft(null);
      await load();
      return true;
    } catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  async function doDraft() {
    setBusy(true); setError(null); setDraft(null); setDraftErrors([]);
    try {
      const res = await fetch("/api/news/topics/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nlText }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? `草案生成失败(${res.status})`); return; }
      if (d.draft) { setDraft(d.draft); setDraftErrors(d.errors ?? []); }
      else setError(`${STATUS_LABEL[d.status] ?? d.status ?? "失败"}：${d.error ?? ""}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function removeItem(id: string) {
    const res = await fetch(`/api/news/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) { setNotice("已移除该条资讯"); await load(); }
  }

  function startEdit() {
    setForm(topics.map((t) => ({ ...t })));
    setEditing(true); setDraft(null);
  }

  function changeForm(i: number, patch: Partial<Topic>) {
    setForm((prev) => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }

  return (
    <div className="news-panel">
      {(error || notice) && (
        <div className={error ? "form-error" : "form-notice"}>{error ?? notice}</div>
      )}

      <div className="panel news-block">
        <div className="news-head">
          <div>
            <h2 className="settings-h2">资讯订阅</h2>
            <p className="muted">
              Qwen 内置联网，只读预览 + 站内消息。不会自动存成文件、不进周报、不混入站内数据源。
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-primary"
            disabled={busy || !model?.configured} onClick={() => void doFetch()}>
            {busy ? "获取中…" : "获取资讯"}
          </button>
        </div>
        {model && !model.configured && (
          <div className="form-error">未配置 Qwen 模型，无法获取资讯。</div>
        )}
        {model?.configured && (
          <p className="muted news-model">模型：{model.id} · {model.source_url_note}</p>
        )}

        <h3 className="sch-h3">订阅主题</h3>
        {topics.length === 0 ? <p className="muted">暂无订阅主题</p> : (
          <div className="news-topics">
            {topics.map((t) => (
              <div key={t.id} className={`news-topic ${t.enabled ? "" : "off"}`}>
                <div>
                  <strong>{t.name}</strong> <span className="muted">{t.enabled ? "已启用" : "已停用"}</span>
                  <div className="muted news-query">{t.query}</div>
                </div>
                <button type="button" className="btn btn-sm" disabled={busy || !model?.configured}
                  onClick={() => void doFetch(t.id)}>获取</button>
              </div>
            ))}
          </div>
        )}

        <div className="news-actions">
          <button type="button" className="btn btn-sm" onClick={startEdit}>手动编辑主题</button>
          <label className="news-sched">
            <input type="checkbox" checked={schedule.enabled} disabled={busy}
              onChange={(e) => void saveTopics(topics, { enabled: e.target.checked })} />
            {" "}定时订阅
          </label>
          <input type="time" className="input input-sm" value={schedule.time} disabled={busy}
            onChange={(e) => void saveTopics(topics, { time: e.target.value })} />
          <span className="muted">最近抓取：{schedule.last_run_date ?? "尚未"}</span>
        </div>
      </div>

      {editing && (
        <div className="panel news-block">
          <h3 className="sch-h3">手动编辑主题</h3>
          {form.map((t, i) => (
            <div key={i} className="news-edit-row">
              <input className="input" value={t.name} placeholder="主题名"
                onChange={(e) => changeForm(i, { name: e.target.value })} />
              <input className="input" value={t.query} placeholder="关注方向 / 检索描述"
                onChange={(e) => changeForm(i, { query: e.target.value })} />
              <label className="news-sched">
                <input type="checkbox" checked={t.enabled}
                  onChange={(e) => changeForm(i, { enabled: e.target.checked })} /> 启用
              </label>
              <button type="button" className="btn btn-sm btn-danger"
                onClick={() => setForm((prev) => prev.filter((_, idx) => idx !== i))}>删除</button>
            </div>
          ))}
          <div className="news-actions">
            <button type="button" className="btn btn-sm" onClick={() => setForm((prev) => [
              ...prev, {
                id: "topic-" + Date.now() + "-" + prev.length, name: "",
                query: "", enabled: true, created_at: new Date().toISOString(),
              },
            ])}>+ 添加主题</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy}
              onClick={() => void saveTopics(form)}>保存</button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="panel news-block">
        <h3 className="sch-h3">用一句话改订阅（管家）</h3>
        <p className="muted">
          例如「加一个具身智能的订阅，把图形学那个停掉」。生成草案后逐条确认才生效，草案不会落库。
        </p>
        <div className="news-draft-bar">
          <input className="input" value={nlText} placeholder="用一句话描述想怎么改"
            onChange={(e) => setNlText(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={busy || !nlText.trim()}
            onClick={() => void doDraft()}>生成草案</button>
        </div>
        {draft && (
          <div className="news-draft">
            <p className="muted">草案（未生效）：</p>
            {draft.topics.map((t) => (
              <div key={t.id} className="news-topic">
                <div><strong>{t.name}</strong> <span className="muted">{t.enabled ? "启用" : "停用"}</span>
                  <div className="muted news-query">{t.query}</div></div>
              </div>
            ))}
            {draftErrors.length > 0 && (
              <div className="form-error">校验未通过：{draftErrors.join("；")}</div>
            )}
            <div className="news-actions">
              <button type="button" className="btn btn-sm btn-primary"
                disabled={busy || draftErrors.length > 0}
                onClick={() => void saveTopics(draft.topics)}>确认生效</button>
              <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>丢弃</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel news-block">
        <h3 className="sch-h3">资讯预览（只读）</h3>
        {items.length === 0 ? <p className="muted">还没有资讯，点「获取资讯」试试。</p> : (
          <div className="news-feed">
            {items.map((f) => (
              <div key={f.id} className="news-card">
                <div className="news-card-head">
                  <strong>{f.title}</strong>
                  <button type="button" className="btn btn-sm btn-danger"
                    onClick={() => void removeItem(f.id)}>移除</button>
                </div>
                <p className="news-summary">{f.summary}</p>
                <div className="muted news-meta">
                  <span>{f.topic_name}</span>
                  <span>{f.date || "时间未给出"}</span>
                  <span>抓取 {f.fetched_at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="news-source">
                  {f.url_status === "provided" && f.url
                    ? <a href={f.url} target="_blank" rel="noopener noreferrer">来源链接 ↗</a>
                    : <span className="muted">来源链接：该接口未提供（未编造）</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
