"use client";

/**
 * 站内消息 + 定时任务（三期 C1）、待审批提案（三期 C2）
 * - tab「站内消息」：消息中心（未读计数 / 全部·未读筛选 / 标记已读 / 删除 / 展开正文）
 * - tab「待审批提案」：C2 提案列表（生成预览 / 逐条编辑 / 批准执行 / 驳回 / 留档）
 * - tab「周报数据源」：C3 可配置数据源开关面板（6 类源 + 手动重点），只把勾选源填进周报
 * - 定时任务区在「站内消息」tab 下方：增删改 / 立即运行 / 结构化选时 / 自然语言解析预览 → 确认才保存
 * - 自然语言解析只调一次模型、只返回预览；点「确认添加」才 PUT 保存
 * - C3：weekly_digest 同一次执行额外产出 HTML 周报（AI 评述）并发轻通知
 * - 不做：Qwen 资讯、GLM/Qwen 路由、邮件与系统通知
 */
import { useCallback, useEffect, useState } from "react";
import ProposalPanel from "./ProposalPanel";
import ReportSourcesPanel from "./ReportSourcesPanel";

interface Message {
  id: string; kind: string; title: string; body: string;
  read: boolean; source: string; created_at: string;
}
interface Schedule { kind: "daily" | "weekly"; time: string; weekday?: number }
interface Task {
  id: string; name: string; job: string; enabled: boolean;
  schedule: Schedule; created_at: string; updated_at: string;
}
interface TaskState { last_run_at: string | null; last_settled_at: string; missed_count: number }
interface SchedulerState {
  version: 1; tasks: Record<string, TaskState>;
  last_tip_at?: string | null; last_tick_at: string | null; last_missed_notice_at: string | null;
}
interface Job { id: string; name: string; desc: string }
interface Status {
  config: { version: 1; tasks: Task[] };
  state: SchedulerState;
  jobs: Job[];
  runtime: { tick_interval: string; ai_commentary_enabled: boolean; note: string };
}
interface Parsed { schedule: Schedule; label: string; confidence: string }

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const KIND_LABEL: Record<string, string> = {
  daily_focus: "每日重点", inbox_scan: "目录巡检", weekly_digest: "每周小结",
  missed: "错过汇总", system: "系统", proposal: "整理提案",
};

function fmt(iso: string | null): string {
  if (!iso) return "从未";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function describe(s: Schedule): string {
  return `${s.kind === "daily" ? "每天" : `每${WEEKDAYS[s.weekday ?? 0]}`} ${s.time}`;
}

interface Draft {
  id?: string;
  name: string;
  job: string;
  enabled: boolean;
  kind: "daily" | "weekly";
  weekday: number;
  time: string;
}

function emptyDraft(): Draft {
  return { name: "每日重点", job: "daily_focus", enabled: true, kind: "daily", weekday: 5, time: "09:00" };
}

export default function SchedulerView() {
  const [tab, setTab] = useState<"messages" | "proposals" | "sources">("messages");
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [nlText, setNlText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/messages?filter=${filter}`).catch(() => null);
    if (!res?.ok) return;
    const d = await res.json();
    setMessages(d.messages ?? []);
    setUnread(d.unread ?? 0);
  }, [filter]);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/scheduler").catch(() => null);
    if (!res?.ok) return;
    setStatus(await res.json());
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function patch(body: unknown) {
    const res = await fetch("/api/messages", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "操作失败"); return; }
    loadMessages(); loadStatus();
  }
  async function remove(id: string) {
    const res = await fetch(`/api/messages?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "删除失败"); return; }
    loadMessages();
  }

  async function saveTasks(next: Task[]) {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/scheduler", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: next.map((t) => ({
        id: t.id, name: t.name, job: t.job, enabled: t.enabled, schedule: t.schedule,
      })) }),
    });
    setBusy(false);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "保存失败"); return false; }
    setNotice("任务配置已保存");
    setDraft(null);
    loadStatus();
    return true;
  }

  const tasks = status?.config.tasks ?? [];

  function saveDraft() {
    if (!draft) return;
    const schedule: Schedule = draft.kind === "weekly"
      ? { kind: "weekly", time: draft.time, weekday: draft.weekday }
      : { kind: "daily", time: draft.time };
    const now = new Date().toISOString();
    if (draft.id) {
      saveTasks(tasks.map((t) => t.id === draft.id
        ? { ...t, name: draft.name, job: draft.job, enabled: draft.enabled, schedule, updated_at: now }
        : t));
    } else {
      saveTasks([...tasks, {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: draft.name, job: draft.job, enabled: draft.enabled, schedule,
        created_at: now, updated_at: now,
      }]);
    }
  }

  async function runNow(id: string) {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch("/api/scheduler/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: id }),
    });
    setBusy(false);
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "运行失败"); return; }
    setNotice(`已生成站内消息：${d.message?.title ?? ""}`);
    loadMessages(); loadStatus();
  }

  async function doParse() {
    setError(null); setParsed(null); setParsing(true);
    const res = await fetch("/api/scheduler/parse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: nlText }),
    }).catch(() => null);
    setParsing(false);
    if (!res) { setError("请求失败，请检查服务是否在线"); return; }
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "解析失败"); return; }
    setParsed(d.parsed as Parsed);
  }

  function confirmParsed() {
    if (!parsed) return;
    const now = new Date().toISOString();
    saveTasks([...tasks, {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: draft?.name?.trim() || "自定义定时", job: draft?.job ?? "daily_focus",
      enabled: true, schedule: parsed.schedule, created_at: now, updated_at: now,
    }]);
    setParsed(null); setNlText("");
  }

  return (
    <section>
      <h1 className="view-title">站内消息</h1>
      <p className="view-desc">
        定时任务的汇报与 AI 整理提案都投递到这里。调度跑在服务进程内，<strong>不动系统设置</strong>，
        服务没开就不跑、错过不补跑只记次数。审批闸门：<strong>你批准后才动文件</strong>。
      </p>

      {(error || notice) && (
        <div className={error ? "form-error" : "form-notice"}>{error ?? notice}</div>
      )}

      <div className="view-tabs seg">
        <button type="button" className={`seg-btn ${tab === "messages" ? "active" : ""}`} onClick={() => setTab("messages")}>站内消息</button>
        <button type="button" className={`seg-btn ${tab === "proposals" ? "active" : ""}`} onClick={() => setTab("proposals")}>待审批提案</button>
        <button type="button" className={`seg-btn ${tab === "sources" ? "active" : ""}`} onClick={() => setTab("sources")}>周报数据源</button>
      </div>

      {tab === "messages" ? (
        <>
      {/* ---------- 消息中心 ---------- */}
      <div className="panel msg-block">
        <div className="msg-toolbar">
          <div className="seg">
            <button type="button" className={`seg-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>全部</button>
            <button type="button" className={`seg-btn ${filter === "unread" ? "active" : ""}`} onClick={() => setFilter("unread")}>未读 {unread}</button>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => patch({ all: true })} disabled={unread === 0}>全部标为已读</button>
        </div>
        {messages.length === 0 ? (
          <div className="empty-state">暂无消息。可以在下方点「立即运行」生成一条。</div>
        ) : (
          <div className="msg-list">
            {messages.map((m) => {
              const open = expanded.includes(m.id);
              return (
                <div key={m.id} className={`msg-row ${m.read ? "" : "unread"}`}>
                  <div className="msg-row-main">
                    <button type="button" className="msg-title" onClick={() =>
                      setExpanded(open ? expanded.filter((x) => x !== m.id) : [...expanded, m.id])
                    }>
                      {!m.read && <span className="msg-dot" />}{m.title}
                    </button>
                    <div className="msg-meta">
                      <span className="tag">{KIND_LABEL[m.kind] ?? m.kind}</span>
                      <span className="muted">{fmt(m.created_at)}</span>
                    </div>
                  </div>
                  {open && <pre className="msg-body">{m.body}</pre>}
                  <div className="msg-actions">
                    {!m.read && <button type="button" className="btn btn-sm" onClick={() => patch({ id: m.id, read: true })}>标记已读</button>}
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(m.id)}>删除</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- 定时任务 ---------- */}
      <div className="panel sch-block">
        <div className="sch-head">
          <h2 className="settings-h2">定时任务</h2>
          <span className="muted">
            {status ? `${status.runtime.tick_interval}盘点 · 上次 ${fmt(status.state.last_tick_at)}` : "载入中…"}
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => { setDraft(emptyDraft()); setParsed(null); setError(null); }}>+ 新建任务</button>
        </div>
        <p className="muted sch-note">
          {status?.runtime.note ?? "服务进程内调度，不动系统设置"}
          。前三个内置任务只做程序填数、不调用模型生成评述；「生成整理提案」才会按需调用模型补弱标签建议。
        </p>

        {tasks.length === 0 ? (
          <div className="empty-state">还没有任务，点「新建任务」或让服务自动生成默认任务。</div>
        ) : (
          <div className="sch-list">
            {tasks.map((t) => {
              const st = status?.state.tasks[t.id];
              return (
                <div key={t.id} className="sch-row">
                  <div className="sch-row-main">
                    <div className="sch-name">
                      {t.name}
                      <span className={`tag ${t.enabled ? "" : "tag-off"}`}>{t.enabled ? "启用" : "停用"}</span>
                    </div>
                    <div className="muted">{describe(t.schedule)} · {status?.jobs.find((j) => j.id === t.job)?.desc ?? t.job}</div>
                    <div className="muted">上次运行 {fmt(st?.last_run_at ?? null)} · 累计错过 {st?.missed_count ?? 0} 次</div>
                  </div>
                  <div className="sch-actions">
                    <button type="button" className="btn btn-sm" onClick={() => runNow(t.id)} disabled={busy}>立即运行</button>
                    <button type="button" className="btn btn-sm" onClick={() => setDraft({
                      id: t.id, name: t.name, job: t.job, enabled: t.enabled,
                      kind: t.schedule.kind, weekday: t.schedule.weekday ?? 5, time: t.schedule.time,
                    })}>编辑</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => saveTasks(tasks.filter((x) => x.id !== t.id))} disabled={busy}>删除</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draft && (
          <div className="sch-form">
            <h3 className="sch-h3">{draft.id ? "编辑任务" : "新建任务"}（结构化选时）</h3>
            <div className="sch-fields">
              <label className="sch-field">
                <span>名称</span>
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="sch-field">
                <span>任务</span>
                <select className="input" value={draft.job} onChange={(e) => setDraft({ ...draft, job: e.target.value })}>
                  {(status?.jobs ?? [{ id: "daily_focus", name: "每日重点", desc: "" }]).map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              </label>
              <label className="sch-field">
                <span>频次</span>
                <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                </select>
              </label>
              {draft.kind === "weekly" && (
                <label className="sch-field">
                  <span>星期</span>
                  <select className="input" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                    {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
                  </select>
                </label>
              )}
              <label className="sch-field">
                <span>时间</span>
                <input className="input" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
              </label>
              <label className="sch-check">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                启用
              </label>
            </div>
            <div className="sch-form-actions">
              <button type="button" className="btn btn-sm btn-primary" onClick={saveDraft} disabled={busy}>保存</button>
              <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>取消</button>
            </div>
          </div>
        )}

        <div className="sch-nl">
          <h3 className="sch-h3">用一句话描述时间（自然语言）</h3>
          <p className="muted">调一次模型解析成同一份配置；<strong>解析只预览、不保存</strong>，点「确认添加」才生效。</p>
          <div className="sch-nl-bar">
            <input
              className="input" placeholder="例如：每周五晚上 9 点"
              value={nlText} onChange={(e) => { setNlText(e.target.value); setParsed(null); }}
            />
            <button type="button" className="btn btn-sm" onClick={doParse} disabled={parsing || !nlText.trim()}>
              {parsing ? "解析中…" : "解析"}
            </button>
          </div>
          {parsed && (
            <div className="sch-parsed">
              <div>
                解析结果：<strong>{parsed.label}</strong>
                <span className="muted">（置信度 {parsed.confidence}）</span>
              </div>
              <div className="muted">将使用上方表单里的「名称 / 任务」新建一个任务，默认启用。</div>
              <button type="button" className="btn btn-sm btn-primary" onClick={confirmParsed} disabled={busy}>确认添加</button>
            </div>
          )}
        </div>
      </div>
        </>
      ) : tab === "proposals" ? (
        <ProposalPanel />
      ) : (
        <ReportSourcesPanel />
      )}
    </section>
  );
}
