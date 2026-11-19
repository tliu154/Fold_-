"use client";

/**
 * 待办页（一期 A2）
 * - 独立页面：列表筛选（全部/待办/已完成）+ 新增 + 勾选完成 + 编辑 + 软删除 + 恢复
 * - 数据存网站自建主库（items 表 type=todo），浏览器直连，无 op / 审批
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";

interface Todo {
  id: string;
  title: string;
  content: string;
  due_at: string | null;
  tags: string[];
  status: "active" | "done";
  created_at: string;
  updated_at: string;
}

type Filter = "all" | "active" | "done";

export default function TodoView() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showTrash, setShowTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/todos?filter=${filter}`);
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    setTodos(data.todos ?? []);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; error?: string }> {
    setError(null);
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* 空响应 */ }
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : `请求失败(${res.status})`);
      return { ok: false, error: typeof data.error === "string" ? data.error : undefined };
    }
    return { ok: true };
  }

  async function toggle(t: Todo) {
    const r = await api(`/api/todos/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: t.status === "done" ? "active" : "done" }),
    });
    if (r.ok) load();
  }

  async function remove(t: Todo) {
    const r = await api(`/api/todos/${t.id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <section>
      <h1 className="view-title">待办</h1>
      <p className="view-desc">随手记一条要做的事。数据存在本机主库，可勾选完成、编辑、删除后恢复。</p>

      <NewTodoForm onCreated={load} onError={setError} />

      {error && <p className="form-error">{error}</p>}

      <div className="todo-toolbar">
        <div className="seg">
          {(["all", "active", "done"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`seg-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "全部" : f === "active" ? "待办" : "已完成"}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => setShowTrash((v) => !v)}>
          {showTrash ? "收起回收站" : "回收站"}
        </button>
      </div>

      {showTrash && <TrashView onRestored={load} />}

      {todos === null ? (
        <p className="muted">载入中…</p>
      ) : todos.length === 0 ? (
        <div className="panel"><EmptyState text="这里还没有待办，先记一条" /></div>
      ) : (
        <ul className="todo-list">
          {todos.map((t) => (
            <TodoRow key={t.id} todo={t} onToggle={() => toggle(t)} onChanged={load} onRemove={() => remove(t)} onError={setError} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewTodoForm({ onCreated, onError }: { onCreated: () => void; onError: (e: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [due, setDue] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    onError(null);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        content: content.trim(),
        due_at: due || null,
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
    setTitle(""); setContent(""); setDue(""); setTags("");
    onCreated();
  }

  return (
    <form className="panel todo-form" onSubmit={submit}>
      <div className="todo-form-row">
        <input
          className="input"
          placeholder="要做什么？"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <button className="btn btn-primary" type="submit" disabled={saving || !title.trim()}>
          {saving ? "保存中…" : "添加"}
        </button>
      </div>
      <div className="todo-form-row todo-form-detail">
        <input className="input" type="date" aria-label="截止日期" value={due} onChange={(e) => setDue(e.target.value)} />
        <input className="input" placeholder="标签（空格/逗号分隔）" value={tags} onChange={(e) => setTags(e.target.value)} />
        <input className="input" placeholder="备注（可选）" value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} />
      </div>
    </form>
  );
}

function TodoRow({
  todo, onToggle, onChanged, onRemove, onError,
}: {
  todo: Todo;
  onToggle: () => void;
  onChanged: () => void;
  onRemove: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [content, setContent] = useState(todo.content);
  const [due, setDue] = useState(todo.due_at ?? "");
  const [tags, setTags] = useState(todo.tags.join(", "));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        content: content.trim(),
        due_at: due || null,
        tags: tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
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
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <div className="todo-form-row todo-form-detail">
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="标签" />
            <input className="input" value={content} onChange={(e) => setContent(e.target.value)} placeholder="备注" />
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
    <li className={`panel todo-row ${todo.status === "done" ? "done" : ""}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.status === "done"}
        onChange={onToggle}
        aria-label="完成"
      />
      <div className="todo-body">
        <div className="todo-title">{todo.title}</div>
        {(todo.content || todo.tags.length > 0 || todo.due_at) && (
          <div className="todo-meta muted">
            {todo.due_at && <span className="todo-due">截止 {todo.due_at}</span>}
            {todo.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            {todo.content && <span className="todo-note">{todo.content}</span>}
          </div>
        )}
      </div>
      <div className="todo-actions">
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>编辑</button>
        <button type="button" className="btn btn-sm" onClick={onRemove}>删除</button>
      </div>
    </li>
  );
}

/** 回收站：只显示软删除的待办，可恢复 */
function TrashView({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<Todo[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/todos?onlyDeleted=1");
    if (res.ok) {
      const data = await res.json();
      setItems(data.todos ?? []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function restore(id: string) {
    const res = await fetch(`/api/todos/${id}/restore`, { method: "POST" });
    if (res.ok) {
      setMsg("已恢复");
      load();
      onRestored();
    } else {
      setMsg("恢复失败");
    }
  }

  return (
    <div className="panel trash-box">
      <h2 className="settings-h2">回收站（已删除的待办）</h2>
      {msg && <p className="muted">{msg}</p>}
      {items === null ? (
        <p className="muted">载入中…</p>
      ) : items.length === 0 ? (
        <p className="muted">回收站是空的</p>
      ) : (
        <ul className="todo-list">
          {items.map((t) => (
            <li key={t.id} className="todo-row trash-row">
              <div className="todo-body">
                <div className="todo-title">{t.title}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => restore(t.id)}>恢复</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
