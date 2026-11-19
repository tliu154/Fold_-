"use client";

/**
 * 长期目标页（一期 A5）
 * - 存本地配置 data/goals.json，不进主库；独立于待办/日程/打卡
 * - 五项：标题 / 描述 / 目标日期 / 状态 / 进度(手填)
 * - 新增 / 编辑 / 直接删除；按创建时间倒序；不做里程碑、拖拽、自动进度
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";

type GoalStatus = "active" | "done" | "paused";
interface Goal {
  id: string;
  title: string;
  description: string;
  target_date: string | null;
  status: GoalStatus;
  progress: number;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "进行中", done: "已完成", paused: "搁置",
};

export default function GoalView() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/goals").catch(() => null);
    if (res?.status === 401) { window.location.href = "/login"; return; }
    const data = res ? await res.json().catch(() => ({ goals: [] })) : { goals: [] };
    setGoals(data.goals ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function raw(path: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    setError(null);
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) setError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
    return { ok: res.ok, data };
  }

  async function remove(id: string) {
    const r = await raw(`/api/goals/${id}`, { method: "DELETE" });
    if (r.ok) { setNotice("已删除"); load(); }
  }

  return (
    <section>
      <h1 className="view-title">长期目标</h1>
      <p className="view-desc">一份独立的手填清单，存本地配置文件，不进主库。进度自己填，不自动计算。</p>

      <GoalForm onSaved={() => { load(); setNotice("已保存"); }} onError={setError} />
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="todo-toolbar">
        <span className="muted">共 {goals?.length ?? 0} 个目标</span>
      </div>

      {goals === null ? (
        <p className="muted">载入中…</p>
      ) : goals.length === 0 ? (
        <div className="panel"><EmptyState text="还没有长期目标，先写一个" /></div>
      ) : (
        <ul className="todo-list">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} onChanged={load} onRemove={() => remove(g.id)} onError={setError} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalForm({ onSaved, onError }: { onSaved: () => void; onError: (e: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<GoalStatus>("active");
  const [progress, setProgress] = useState("0");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), description: description.trim(),
        target_date: date || null, status, progress: Number(progress),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { onError(data.error ?? `请求失败(${res.status})`); return; }
    setTitle(""); setDescription(""); setDate(""); setStatus("active"); setProgress("0");
    onSaved();
  }

  return (
    <form className="panel todo-form" onSubmit={submit}>
      <div className="checkin-form-title">新建长期目标</div>
      <div className="todo-form-row">
        <input className="input" placeholder="目标标题，如：读完《深度学习》" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <button className="btn btn-primary" type="submit" disabled={saving || !title.trim()}>添加</button>
      </div>
      <div className="todo-form-row todo-form-detail">
        <input className="input" type="date" aria-label="目标日期" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="input" aria-label="状态" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
          <option value="active">进行中</option>
          <option value="done">已完成</option>
          <option value="paused">搁置</option>
        </select>
        <input className="input" type="number" min={0} max={100} aria-label="进度百分比" value={progress} onChange={(e) => setProgress(e.target.value)} />
        <input className="input" placeholder="描述（可选）" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
      </div>
    </form>
  );
}

function GoalRow({ goal, onChanged, onRemove, onError }: {
  goal: Goal;
  onChanged: () => void;
  onRemove: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: goal.title, description: goal.description,
    date: goal.target_date ?? "", status: goal.status, progress: String(goal.progress),
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(), description: form.description.trim(),
        target_date: form.date || null, status: form.status, progress: Number(form.progress),
      }),
    });
    const data = await res.json();
    if (!res.ok) { onError(data.error ?? `请求失败(${res.status})`); return; }
    setEditing(false); onChanged();
  }

  if (editing) {
    return (
      <li className="panel todo-row todo-edit">
        <form onSubmit={save}>
          <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} />
          <div className="todo-form-row todo-form-detail">
            <input className="input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as GoalStatus }))}>
              <option value="active">进行中</option><option value="done">已完成</option><option value="paused">搁置</option>
            </select>
            <input className="input" type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
            <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="描述" />
          </div>
          <div className="todo-edit-actions">
            <button className="btn btn-primary" type="submit">保存</button>
            <button className="btn" type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="panel todo-row goal-row">
      <div className="todo-body">
        <div className="todo-title">{goal.title}</div>
        {goal.description && <div className="muted todo-note">{goal.description}</div>}
        <div className="todo-meta muted">
          <span className={`tag ${goal.status === "done" ? "tag-done" : ""}`}>{STATUS_LABEL[goal.status]}</span>
          {goal.target_date && <span className="todo-due">目标 {goal.target_date}</span>}
        </div>
        <div className="goal-progress">
          <div className="goal-progress-bar"><div className="goal-progress-fill" style={{ width: `${goal.progress}%` }} /></div>
          <span className="muted">{goal.progress}%</span>
        </div>
      </div>
      <div className="todo-actions">
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>编辑</button>
        <button type="button" className="btn btn-sm" onClick={onRemove}>删除</button>
      </div>
    </li>
  );
}
