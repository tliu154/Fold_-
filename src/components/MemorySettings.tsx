"use client";

/**
 * 设置页「记忆与映射」编辑区（一期 A7）
 * - 基础身份 / 功能记忆 / 事实：条目增删改、标签、按 scope 或标签筛选
 * - 映射表：按功能勾选 profile / context、编辑 features；支持恢复默认
 * - 预览：展示按映射组装的 system prompt
 * - P12 全自动映射：不做「手动切换当前记忆」的界面，这里只做配置
 */
import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";

interface MemoryItem {
  id: string;
  scope: "profile" | "feature" | "fact";
  feature?: string;
  title: string;
  content: string;
  tags: string[];
  updated_at: string;
}
interface FeatureMapping { profile: boolean; features: string[]; context: boolean }
type Mapping = Record<string, FeatureMapping>;

const SCOPE_LABEL: Record<string, string> = {
  profile: "基础身份", feature: "功能记忆", fact: "事实",
};

export default function MemorySettings() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaults, setDefaults] = useState<Mapping>({});
  const [filter, setFilter] = useState<"" | "profile" | "feature" | "fact">("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<MemoryItem | "new" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter) q.set("scope", filter);
    if (tag.trim()) q.set("tag", tag.trim());
    const res = await fetch(`/api/memory?${q.toString()}`).catch(() => null);
    if (res?.status === 401) { window.location.href = "/login"; return; }
    const d = res ? await res.json().catch(() => ({})) : {};
    setItems(d.items ?? []);
    setMapping(d.mapping ?? {});
    setDefaults(d.defaults ?? {});
  }, [filter, tag]);

  useEffect(() => { load(); }, [load]);

  async function remove(item: MemoryItem) {
    const res = await fetch(`/api/memory/${item.id}`, { method: "DELETE" });
    if (!res.ok) { setError("删除失败"); return; }
    setNotice("已删除"); load();
  }

  async function saveMapping(next: Mapping) {
    const res = await fetch("/api/memory/mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: next }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "保存失败"); return; }
    setMapping(d.mapping); setNotice("映射已保存");
  }

  async function reset() {
    const res = await fetch("/api/memory/mapping", { method: "DELETE" });
    const d = await res.json();
    setMapping(d.mapping); setNotice("已恢复默认映射");
  }

  async function showPreview() {
    const res = await fetch("/api/memory/preview?feature=chat");
    const d = await res.json();
    setPreview(d.system || "（记忆为空，不会注入 system 消息）");
  }

  return (
    <div className="panel settings-block memory-block">
      <div className="memory-head">
        <h2 className="settings-h2">记忆与映射</h2>
        <div className="memory-head-actions">
          <button type="button" className="btn btn-sm" onClick={showPreview}>预览 prompt</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditor("new")}>+ 新增条目</button>
        </div>
      </div>
      <p className="muted">三层：基础身份常驻 · 功能记忆按功能切换 · 临时上下文复用对话历史。点功能自动拼 prompt，无需手动切换。</p>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-notice">{notice}</p>}

      <div className="memory-filters">
        <div className="seg">
          {(["", "profile", "feature", "fact"] as const).map((s) => (
            <button key={s || "all"} type="button" className={`seg-btn ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
              {s === "" ? "全部" : SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <input className="input memory-tag-input" placeholder="按标签筛选" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>

      {items.length === 0 ? (
        <p className="muted">没有符合条件的记忆条目</p>
      ) : (
        <ul className="feature-list memory-list">
          {items.map((i) => (
            <li key={i.id} className="memory-row">
              <div className="memory-row-main">
                <div className="feature-name">{i.title}</div>
                <div className="muted memory-content">{i.content}</div>
                <div className="memory-tags">
                  <span className="tag">{i.scope === "feature" ? `功能:${i.feature}` : SCOPE_LABEL[i.scope]}</span>
                  {i.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
              <div className="memory-row-actions">
                <button type="button" className="btn btn-sm" onClick={() => setEditor(i)}>编辑</button>
                <button type="button" className="btn btn-sm" onClick={() => remove(i)}>删除</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="memory-subtitle">功能映射表</h3>
      <p className="muted">默认规则写在程序里；此处修改会覆盖默认值。本期只有 <code>chat</code>（普通对话）真正生效。</p>
      <div className="memory-map">
        {Object.entries(mapping).map(([name, m]) => (
          <div key={name} className="memory-map-row">
            <span className="memory-map-name">{name}{name === "chat" ? "（生效）" : "（预留）"}</span>
            <label className="memory-check"><input type="checkbox" checked={m.profile}
              onChange={(e) => saveMapping({ ...mapping, [name]: { ...m, profile: e.target.checked } })} />基础身份</label>
            <label className="memory-check"><input type="checkbox" checked={m.context}
              onChange={(e) => saveMapping({ ...mapping, [name]: { ...m, context: e.target.checked } })} />临时上下文</label>
            <span className="muted">记忆模块：{m.features.join(", ") || "无"}</span>
          </div>
        ))}
      </div>
      <div className="memory-map-actions">
        <button type="button" className="btn btn-sm" onClick={reset}>恢复默认映射</button>
        <span className="muted">默认项：{Object.keys(defaults).join(" / ")}</span>
      </div>

      {editor && (
        <MemoryEditor item={editor === "new" ? null : editor} onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setNotice("已保存"); load(); }} />
      )}
      {preview !== null && (
        <Modal title="组装后的 system prompt（chat）" onClose={() => setPreview(null)}>
          <pre className="memory-preview">{preview}</pre>
        </Modal>
      )}
    </div>
  );
}

function MemoryEditor({ item, onClose, onSaved }: {
  item: MemoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<"profile" | "feature" | "fact">(item?.scope ?? "profile");
  const [feature, setFeature] = useState(item?.feature ?? "chat");
  const [title, setTitle] = useState(item?.title ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const [tags, setTags] = useState((item?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { setError("标题和内容不能为空"); return; }
    setSaving(true);
    const body = {
      scope, feature: scope === "feature" ? feature : undefined,
      title: title.trim(), content: content.trim(),
      tags: tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
    };
    const res = await fetch(item ? `/api/memory/${item.id}` : "/api/memory", {
      method: item ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(d.error ?? `请求失败(${res.status})`); return; }
    onSaved();
  }

  return (
    <Modal title={item ? "编辑记忆条目" : "新增记忆条目"} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="modal-label">层级
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="profile">基础身份（常驻）</option>
            <option value="feature">功能记忆（按功能）</option>
            <option value="fact">事实</option>
          </select>
        </label>
        {scope === "feature" && (
          <label className="modal-label">功能名<input className="input" value={feature} onChange={(e) => setFeature(e.target.value)} /></label>
        )}
        <label className="modal-label">标题<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
        <label className="modal-label">内容<textarea className="input" rows={4} value={content} onChange={(e) => setContent(e.target.value)} /></label>
        <label className="modal-label">标签（逗号分隔）<input className="input" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>保存</button>
          <button className="btn" type="button" onClick={onClose}>取消</button>
        </div>
      </form>
    </Modal>
  );
}
