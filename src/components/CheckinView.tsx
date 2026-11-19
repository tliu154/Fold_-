"use client";

/**
 * 打卡页（一期 A4）
 * - 两种：① 习惯定义 + 每日打卡（含补记过去日期）② 随手记一条（独立、不参与连续天数）
 * - 习惯卡片显示连续天数 + 今日是否已打；最近记录按日期倒序
 * - 习惯可编辑/软删除/回收站恢复；打卡记录可删除
 * - 本期不做：到点提醒 / 每周目标次数 / 日历热力图 / 数据导出
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";

interface Habit {
  id: string;
  title: string;
  tags: string[];
  streak: number;
  todayDone: boolean;
  lastDate: string | null;
}
interface Checkin {
  id: string;
  title: string;
  date: string;
  habit_id: string | null;
  note: string;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function CheckinView() {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [records, setRecords] = useState<Checkin[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const hRes = await fetch("/api/habits").catch(() => null);
    if (hRes?.status === 401) { window.location.href = "/login"; return; }
    const [h, c] = await Promise.all([
      hRes ? hRes.json().catch(() => ({ habits: [] })) : Promise.resolve({ habits: [] }),
      fetch("/api/checkins?limit=30").then((r) => r.json()).catch(() => ({ checkins: [] })),
    ]);
    setHabits(h.habits ?? []);
    setRecords(c.checkins ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function raw(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    setError(null);
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) setError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
    return { ok: res.ok, status: res.status, data };
  }

  async function checkIn(habit: Habit, date: string) {
    const r = await raw("/api/checkins", {
      method: "POST",
      body: JSON.stringify({ title: habit.title, date, habit_id: habit.id }),
    });
    if (r.ok) {
      setNotice(r.data.created === false ? "这一天已经打过卡了" : `已打卡 ${date}`);
      load();
    }
  }

  async function quickNote(title: string, date: string) {
    const r = await raw("/api/checkins", {
      method: "POST",
      body: JSON.stringify({ title, date, habit_id: null }),
    });
    if (r.ok) { setNotice("已记录"); load(); }
  }

  return (
    <section>
      <h1 className="view-title">打卡</h1>
      <p className="view-desc">周期性习惯的完成记录，也能随手记一条。连续天数按实际有记录的日期算，可补记。</p>

      <div className="checkin-forms">
        <NewHabitForm onCreated={load} onError={setError} />
        <QuickNoteForm onSubmit={quickNote} />
      </div>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="todo-toolbar">
        <span className="muted">{habits?.length ?? 0} 个习惯 · {records.length} 条最近记录</span>
        <button type="button" className="btn" onClick={() => setShowTrash((v) => !v)}>
          {showTrash ? "收起回收站" : "回收站"}
        </button>
      </div>
      {showTrash && <TrashView onRestored={load} />}

      <h2 className="settings-h2">习惯</h2>
      {habits === null ? (
        <p className="muted">载入中…</p>
      ) : habits.length === 0 ? (
        <div className="panel"><EmptyState text="还没有习惯，先建一个（如「每天阅读」）" /></div>
      ) : (
        <div className="habit-grid">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} onCheckIn={checkIn} onChanged={load} onError={setError} />
          ))}
        </div>
      )}

      <h2 className="settings-h2 checkin-rec-title">最近记录</h2>
      {records.length === 0 ? (
        <div className="panel"><EmptyState text="还没有打卡记录" /></div>
      ) : (
        <ul className="todo-list">
          {records.map((r) => (
            <li key={r.id} className="panel todo-row trash-row">
              <div className="event-time">{r.date}</div>
              <div className="todo-body">
                <div className="todo-title">{r.title}</div>
                {r.note && <div className="muted">{r.note}</div>}
                <div className="muted checkin-kind">{r.habit_id ? "习惯打卡" : "随手记"}</div>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => { const res = await raw(`/api/checkins/${r.id}`, { method: "DELETE" }); if (res.ok) load(); }}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewHabitForm({ onCreated, onError }: { onCreated: () => void; onError: (e: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/habits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), tags: tags.split(/[,，\s]+/).filter(Boolean) }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { onError(data.error ?? `请求失败(${res.status})`); return; }
    setTitle(""); setTags(""); onCreated();
  }
  return (
    <form className="panel todo-form checkin-form" onSubmit={submit}>
      <div className="checkin-form-title">新建习惯</div>
      <div className="todo-form-row">
        <input className="input" placeholder="如：每天阅读" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <button className="btn btn-primary" type="submit" disabled={saving || !title.trim()}>添加</button>
      </div>
      <input className="input checkin-tags" placeholder="标签（可选）" value={tags} onChange={(e) => setTags(e.target.value)} />
    </form>
  );
}

function QuickNoteForm({ onSubmit }: { onSubmit: (title: string, date: string) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  return (
    <form
      className="panel todo-form checkin-form"
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onSubmit(title.trim(), date); setTitle(""); } }}
    >
      <div className="checkin-form-title">随手记一条</div>
      <div className="todo-form-row">
        <input className="input" placeholder="今天做了什么？" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <button className="btn btn-primary" type="submit" disabled={!title.trim()}>记下</button>
      </div>
      <input className="input checkin-tags" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
    </form>
  );
}

function HabitCard({ habit, onCheckIn, onChanged, onError }: {
  habit: Habit;
  onCheckIn: (h: Habit, date: string) => void;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(habit.title);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/habits/${habit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) { const d = await res.json(); onError(d.error ?? `请求失败(${res.status})`); return; }
    setEditing(false); onChanged();
  }
  async function remove() {
    const res = await fetch(`/api/habits/${habit.id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); onError(d.error ?? "删除失败"); return; }
    onChanged();
  }

  return (
    <div className="panel habit-card">
      {editing ? (
        <form onSubmit={save} className="habit-edit">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <div className="todo-edit-actions">
            <button className="btn btn-primary" type="submit">保存</button>
            <button className="btn" type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </form>
      ) : (
        <>
          <div className="habit-head">
            <div className="habit-title">{habit.title}</div>
            <div className={`habit-streak ${habit.streak > 0 ? "on" : ""}`}>连续 {habit.streak} 天</div>
          </div>
          <div className="muted habit-meta">
            {habit.todayDone ? "今天已打卡" : "今天还没打卡"}
            {habit.lastDate && ` · 最近 ${habit.lastDate}`}
          </div>
          <div className="habit-tags">
            {habit.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
          <div className="habit-actions">
            <input className="input habit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="打卡日期" />
            <button className="btn btn-primary btn-sm" type="button" onClick={() => onCheckIn(habit, date)}>打卡</button>
            <button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>编辑</button>
            <button className="btn btn-sm" type="button" onClick={remove}>删除</button>
          </div>
        </>
      )}
    </div>
  );
}

function TrashView({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<Habit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/habits?onlyDeleted=1");
    if (res.ok) setItems((await res.json()).habits ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function restore(id: string) {
    const res = await fetch(`/api/habits/${id}/restore`, { method: "POST" });
    if (res.ok) { setMsg("已恢复"); load(); onRestored(); }
    else setMsg("恢复失败");
  }
  return (
    <div className="panel trash-box">
      <h2 className="settings-h2">回收站（已删除的习惯，打卡记录保留）</h2>
      {msg && <p className="muted">{msg}</p>}
      {items.length === 0 ? <p className="muted">回收站是空的</p> : (
        <ul className="todo-list">
          {items.map((h) => (
            <li key={h.id} className="todo-row trash-row">
              <div className="todo-body"><div className="todo-title">{h.title}</div></div>
              <button type="button" className="btn btn-sm" onClick={() => restore(h.id)}>恢复</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
