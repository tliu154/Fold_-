"use client";

/**
 * 日程页（一期 A3）
 * - 字段：标题/日期/起止时间/地点/备注/标签
 * - 按日期分组：今天 / 明天 / 本周 / 更远 / 已过去；组内按开始时间排序
 * - 新增 / 编辑 / 软删除 / 回收站恢复；无完成态（日程不是待办）
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";

interface CalEvent {
  id: string;
  title: string;
  content: string;
  date: string;
  start: string;
  end: string;
  location: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type Group = "今天" | "明天" | "本周" | "更远" | "已过去";

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(base: string, days: number): string {
  const d = new Date(base + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function groupOf(date: string, today: string): Group {
  if (!date) return "更远";
  if (date < today) return "已过去";
  if (date === today) return "今天";
  if (date === addDays(today, 1)) return "明天";
  if (date <= addDays(today, 7)) return "本周";
  return "更远";
}

const GROUP_ORDER: Group[] = ["今天", "明天", "本周", "更远", "已过去"];

export default function EventView() {
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function api(path: string, init?: RequestInit): Promise<boolean> {
    setError(null);
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
      return false;
    }
    return true;
  }

  async function remove(e: CalEvent) {
    if (await api(`/api/events/${e.id}`, { method: "DELETE" })) load();
  }

  const today = todayStr();
  const grouped: Record<Group, CalEvent[]> = {
    今天: [], 明天: [], 本周: [], 更远: [], 已过去: [],
  };
  for (const e of events ?? []) {
    grouped[groupOf(e.date, today)].push(e);
  }
  for (const g of GROUP_ORDER) {
    grouped[g].sort((a, b) => {
      const ka = `${a.date} ${a.start || "99:99"}`;
      const kb = `${b.date} ${b.start || "99:99"}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  return (
    <section>
      <h1 className="view-title">日程</h1>
      <p className="view-desc">某个时间点要做的事。按日期分组，数据存在本机主库。</p>

      <NewEventForm onCreated={load} onError={setError} />
      {error && <p className="form-error">{error}</p>}

      <div className="todo-toolbar">
        <span className="muted">共 {(events ?? []).length} 条日程</span>
        <button type="button" className="btn" onClick={() => setShowTrash((v) => !v)}>
          {showTrash ? "收起回收站" : "回收站"}
        </button>
      </div>
      {showTrash && <TrashView onRestored={load} />}

      {events === null ? (
        <p className="muted">载入中…</p>
      ) : events.length === 0 ? (
        <div className="panel"><EmptyState text="还没有日程，先加一条" /></div>
      ) : (
        <div className="event-groups">
          {GROUP_ORDER.filter((g) => grouped[g].length > 0).map((g) => (
            <div key={g} className="event-group">
              <h2 className="event-group-title">{g}<span className="muted"> {grouped[g].length}</span></h2>
              <ul className="todo-list">
                {grouped[g].map((e) => (
                  <EventRow key={e.id} event={e} onChanged={load} onRemove={() => remove(e)} onError={setError} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NewEventForm({ onCreated, onError }: { onCreated: () => void; onError: (e: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    onError(null);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), date, start, end,
        location: location.trim(), content: content.trim(),
        tags: tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    setSaving(false);
    if (!res.ok) {
      onError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
      return;
    }
    setTitle(""); setStart(""); setEnd(""); setLocation(""); setTags(""); setContent("");
    onCreated();
  }

  return (
    <form className="panel todo-form" onSubmit={submit}>
      <div className="todo-form-row">
        <input className="input" placeholder="日程标题" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <button className="btn btn-primary" type="submit" disabled={saving || !title.trim() || !date}>
          {saving ? "保存中…" : "添加"}
        </button>
      </div>
      <div className="todo-form-row todo-form-detail">
        <input className="input" type="date" aria-label="日期" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input" type="time" aria-label="开始时间" value={start} onChange={(e) => setStart(e.target.value)} />
        <input className="input" type="time" aria-label="结束时间" value={end} onChange={(e) => setEnd(e.target.value)} />
        <input className="input" placeholder="地点" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="todo-form-row todo-form-detail">
        <input className="input" placeholder="标签（空格/逗号分隔）" value={tags} onChange={(e) => setTags(e.target.value)} />
        <input className="input" placeholder="备注（可选）" value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} />
      </div>
    </form>
  );
}

function EventRow({ event, onChanged, onRemove, onError }: {
  event: CalEvent;
  onChanged: () => void;
  onRemove: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: event.title, date: event.date, start: event.start, end: event.end,
    location: event.location, tags: event.tags.join(", "), content: event.content,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        title: form.title.trim(),
        tags: form.tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) {
      onError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
      return;
    }
    setEditing(false);
    onChanged();
  }

  if (editing) {
    return (
      <li className="panel todo-row todo-edit">
        <form onSubmit={save}>
          <input className="input" value={form.title} onChange={set("title")} maxLength={200} />
          <div className="todo-form-row todo-form-detail">
            <input className="input" type="date" value={form.date} onChange={set("date")} />
            <input className="input" type="time" value={form.start} onChange={set("start")} />
            <input className="input" type="time" value={form.end} onChange={set("end")} />
            <input className="input" value={form.location} onChange={set("location")} placeholder="地点" />
          </div>
          <div className="todo-form-row todo-form-detail">
            <input className="input" value={form.tags} onChange={set("tags")} placeholder="标签" />
            <input className="input" value={form.content} onChange={set("content")} placeholder="备注" />
          </div>
          <div className="todo-edit-actions">
            <button className="btn btn-primary" type="submit">保存</button>
            <button className="btn" type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </form>
      </li>
    );
  }

  const time = event.start ? `${event.start}${event.end ? " - " + event.end : ""}` : "未定时间";
  return (
    <li className="panel todo-row">
      <div className="event-time">{time}</div>
      <div className="todo-body">
        <div className="todo-title">{event.title}</div>
        <div className="todo-meta muted">
          <span className="todo-due">{event.date}</span>
          {event.location && <span className="event-location">地点 {event.location}</span>}
          {event.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          {event.content && <span className="todo-note">{event.content}</span>}
        </div>
      </div>
      <div className="todo-actions">
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>编辑</button>
        <button type="button" className="btn btn-sm" onClick={onRemove}>删除</button>
      </div>
    </li>
  );
}

function TrashView({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<CalEvent[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/events?onlyDeleted=1");
    if (res.ok) {
      const data = await res.json();
      setItems(data.events ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function restore(id: string) {
    const res = await fetch(`/api/events/${id}/restore`, { method: "POST" });
    if (res.ok) { setMsg("已恢复"); load(); onRestored(); }
    else setMsg("恢复失败");
  }

  return (
    <div className="panel trash-box">
      <h2 className="settings-h2">回收站（已删除的日程）</h2>
      {msg && <p className="muted">{msg}</p>}
      {items === null ? <p className="muted">载入中…</p> : items.length === 0 ? (
        <p className="muted">回收站是空的</p>
      ) : (
        <ul className="todo-list">
          {items.map((e) => (
            <li key={e.id} className="todo-row trash-row">
              <div className="todo-body"><div className="todo-title">{e.title}</div><div className="muted">{e.date}</div></div>
              <button type="button" className="btn btn-sm" onClick={() => restore(e.id)}>恢复</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
