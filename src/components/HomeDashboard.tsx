"use client";

/**
 * 首页仪表盘（一期首页改版）
 * - 单列、从上到下多个实内容分区，鼠标垂直滚动；侧栏仍是点击切页
 * - 顺序：待办 → 日程 → 打卡 → 长期目标 → 备忘录（占位）
 * - 每区最多 5 条 + 「查看全部 →」跳到「记录与规划」对应 tab
 * - 每区标题旁 + 号弹框新增；点已有条目弹同一个框编辑并带删除按钮
 * - 打卡弹框内两个 tab 切「新建习惯 / 随手记一条」
 * - 调用现有 API，不改各 tab 页代码
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./Modal";

type Tab = "todo" | "event" | "checkin" | "memo" | "goal";
type Section = "todo" | "event" | "habit" | "note" | "goal";

interface Todo { id: string; title: string; content: string; due_at: string | null; tags: string[]; status: "active" | "done"; }
interface Evt { id: string; title: string; date: string; start: string; end: string; location: string; content: string; tags: string[]; }
interface Habit { id: string; title: string; tags: string[]; streak: number; todayDone: boolean; }
interface Note { id: string; title: string; date: string; habit_id: string | null; note: string; }
interface Goal { id: string; title: string; description: string; target_date: string | null; status: string; progress: number; }

interface DashboardData {
  todos: Todo[];
  events: Evt[];
  habits: Habit[];
  notes: Note[];
  goals: Goal[];
}

interface FormState {
  title: string;
  content: string;
  description: string;
  due_at: string;
  date: string;
  start: string;
  end: string;
  location: string;
  target_date: string;
  status: string;
  progress: string;
  tags: string;
  note: string;
}

interface Editor {
  section: Section;
  mode: "create" | "edit";
  id?: string;
  data: Record<string, unknown>;
  checkinTabs: boolean; // 打卡的「+ 号」弹框显示两个 tab
}

const EMPTY_FORM: FormState = {
  title: "", content: "", description: "", due_at: "", date: "", start: "",
  end: "", location: "", target_date: "", status: "active", progress: "0",
  tags: "", note: "",
};

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function HomeDashboard({ onOpen }: { onOpen: (tab: Tab) => void }) {
  const [data, setData] = useState<DashboardData>({ todos: [], events: [], habits: [], notes: [], goals: [] });
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memoModal, setMemoModal] = useState(false);

  const load = useCallback(async () => {
    const r = await Promise.all([
      fetch("/api/todos?filter=all").then((x) => x.json()).catch(() => ({ todos: [] })),
      fetch("/api/events").then((x) => x.json()).catch(() => ({ events: [] })),
      fetch("/api/habits").then((x) => x.json()).catch(() => ({ habits: [] })),
      fetch("/api/checkins?limit=50").then((x) => x.json()).catch(() => ({ checkins: [] })),
      fetch("/api/goals").then((x) => x.json()).catch(() => ({ goals: [] })),
    ]);
    const checkins = (r[3].checkins ?? []) as Note[];
    setData({
      todos: (r[0].todos ?? []) as Todo[],
      events: (r[1].events ?? []) as Evt[],
      habits: (r[2].habits ?? []) as Habit[],
      notes: checkins.filter((c) => c.habit_id === null),
      goals: (r[4].goals ?? []) as Goal[],
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate(section: Section, checkinTabs = false) {
    setNotice(null);
    setEditor({ section, mode: "create", data: {}, checkinTabs });
  }
  function openEdit(section: Section, item: Record<string, unknown>, id: string) {
    setNotice(null);
    setEditor({ section, mode: "edit", id, data: item, checkinTabs: false });
  }

  return (
    <section>
      <h1 className="view-title">首页</h1>
      <p className="view-desc">整合 + 调度 + 自动化的个人指挥台。内容从上到下分区，点 + 号或条目即可编辑。</p>
      {notice && <p className="form-notice">{notice}</p>}

      {loading ? <p className="muted">载入中…</p> : (
        <>
          {/* 待办 */}
          <HomeSection title="待办" onAdd={() => openCreate("todo")} onAll={() => onOpen("todo")}>
            {data.todos.length === 0 ? <p className="muted">还没有待办</p> : data.todos.slice(0, 5).map((t) => (
              <HomeItem key={t.id} onClick={() => openEdit("todo", t as unknown as Record<string, unknown>, t.id)}
                left={
                  <>
                    <span className={`home-item-title ${t.status === "done" ? "done" : ""}`}>{t.title}</span>
                    <span className="muted home-item-meta">
                      {t.due_at && `截止 ${t.due_at}`}{t.tags.map((x) => <span key={x} className="tag">{x}</span>)}
                      {t.status === "done" && <span className="tag">已完成</span>}
                    </span>
                  </>
                } />
            ))}
          </HomeSection>

          {/* 日程 */}
          <HomeSection title="日程" onAdd={() => openCreate("event")} onAll={() => onOpen("event")}>
            {data.events.length === 0 ? <p className="muted">还没有日程</p> : data.events.slice(0, 5).map((e) => (
              <HomeItem key={e.id} onClick={() => openEdit("event", e as unknown as Record<string, unknown>, e.id)}
                left={
                  <>
                    <span className="home-item-title">{e.title}</span>
                    <span className="muted home-item-meta">
                      {e.date} {e.start && `${e.start}${e.end ? " - " + e.end : ""}`}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </>
                } />
            ))}
          </HomeSection>

          {/* 打卡：习惯组 + 随手记组，共用一个 + 号 */}
          <HomeSection title="打卡" onAdd={() => openCreate("habit", true)} onAll={() => onOpen("checkin")}>
            <div className="home-sub-label muted">习惯</div>
            {data.habits.length === 0 ? <p className="muted">还没有习惯</p> : data.habits.slice(0, 5).map((h) => (
              <HomeItem key={h.id} onClick={() => openEdit("habit", h as unknown as Record<string, unknown>, h.id)}
                left={
                  <>
                    <span className="home-item-title">{h.title}</span>
                    <span className="muted home-item-meta">连续 {h.streak} 天 · {h.todayDone ? "今天已打卡" : "今天未打卡"}</span>
                  </>
                } />
            ))}
            <div className="home-sub-label muted">随手记</div>
            {data.notes.length === 0 ? <p className="muted">还没有随手记</p> : data.notes.slice(0, 5).map((n) => (
              <HomeItem key={n.id} onClick={() => openEdit("note", n as unknown as Record<string, unknown>, n.id)}
                left={<><span className="home-item-title">{n.title}</span><span className="muted home-item-meta">{n.date}</span></>} />
            ))}
          </HomeSection>

          {/* 长期目标 */}
          <HomeSection title="长期目标" onAdd={() => openCreate("goal")} onAll={() => onOpen("goal")}>
            {data.goals.length === 0 ? <p className="muted">还没有长期目标</p> : data.goals.slice(0, 5).map((g) => (
              <HomeItem key={g.id} onClick={() => openEdit("goal", g as unknown as Record<string, unknown>, g.id)}
                left={
                  <>
                    <span className="home-item-title">{g.title}</span>
                    <span className="muted home-item-meta">{g.status === "done" ? "已完成" : g.status === "paused" ? "搁置" : "进行中"} · {g.progress}%</span>
                    <span className="goal-progress home-progress"><span className="goal-progress-bar"><span className="goal-progress-fill" style={{ width: `${g.progress}%` }} /></span></span>
                  </>
                } />
            ))}
          </HomeSection>

          {/* 备忘录占位 */}
          <HomeSection title="备忘录" onAdd={() => setMemoModal(true)}>
            <p className="muted">还没有内容（备忘录待实现）</p>
          </HomeSection>
        </>
      )}

      {editor && (
        <EditorModal
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async (msg) => {
            setEditor(null);
            setNotice(msg);
            await load();
          }}
          onSwitchSection={(s) => setEditor((e) => e ? { ...e, section: s, data: {}, mode: "create" } : e)}
        />
      )}

      {memoModal && (
        <Modal title="备忘录" onClose={() => setMemoModal(false)}>
          <p className="muted">该功能待定义（按需求清单分期实现）。</p>
        </Modal>
      )}
    </section>
  );
}

function HomeSection({ title, onAdd, onAll, children }: {
  title: string;
  onAdd: () => void;
  onAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="home-section panel">
      <div className="home-section-head">
        <h2 className="home-section-title">{title}</h2>
        <div className="home-section-actions">
          {onAll && <button type="button" className="home-all" onClick={onAll}>查看全部 →</button>}
          <button type="button" className="home-add" onClick={onAdd} aria-label={`${title}新增`}>+</button>
        </div>
      </div>
      <div className="home-section-body">{children}</div>
    </div>
  );
}

function HomeItem({ left, onClick }: { left: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="home-item" onClick={onClick}>
      <span className="home-item-left">{left}</span>
      <span className="muted home-item-edit">编辑</span>
    </button>
  );
}

/* ---------- 编辑弹框 ---------- */

function initialForm(section: Section, d: Record<string, unknown>): FormState {
  const str = (k: string) => (typeof d[k] === "string" ? d[k] as string : "");
  const tags = (k: string) => (Array.isArray(d[k]) ? (d[k] as string[]).join(", ") : "");
  return {
    ...EMPTY_FORM,
    title: str("title"),
    content: str("content"),
    description: str("description"),
    due_at: str("due_at"),
    date: str("date") || (section === "event" || section === "note" ? todayStr() : "") ,
    start: str("start"),
    end: str("end"),
    location: str("location"),
    target_date: str("target_date"),
    status: str("status") || "active",
    progress: typeof d.progress === "number" ? String(d.progress) : "0",
    tags: tags("tags"),
    note: str("note"),
  };
}

function EditorModal({ editor, onClose, onSaved, onSwitchSection }: {
  editor: Editor;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onSwitchSection: (s: Section) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editor.section, editor.data));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevSection = useRef(editor.section);

  // 打卡弹框内切 tab 时，把表单重置为新分区的初始值
  useEffect(() => {
    if (prevSection.current !== editor.section) {
      prevSection.current = editor.section;
      setForm(initialForm(editor.section, editor.data));
      setError(null);
    }
  }, [editor.section, editor.data]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const isEdit = editor.mode === "edit";
  const section = editor.section;
  const title = isEdit ? `编辑${SECTION_LABEL[section]}` : `新增${SECTION_LABEL[section]}`;
  const tagsArr = () => form.tags.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);

  function endpoint(): { url: string; method: string; body: Record<string, unknown> } {
    const base = SECTION_API[section];
    if (section === "todo") {
      return { url: isEdit ? `${base}/${editor.id}` : base, method: isEdit ? "PATCH" : "POST",
        body: { title: form.title.trim(), content: form.content.trim(), due_at: form.due_at || null, tags: tagsArr() } };
    }
    if (section === "event") {
      return { url: isEdit ? `${base}/${editor.id}` : base, method: isEdit ? "PATCH" : "POST",
        body: { title: form.title.trim(), date: form.date, start: form.start, end: form.end,
          location: form.location.trim(), content: form.content.trim(), tags: tagsArr() } };
    }
    if (section === "habit") {
      return { url: isEdit ? `${base}/${editor.id}` : base, method: isEdit ? "PATCH" : "POST",
        body: { title: form.title.trim(), tags: tagsArr() } };
    }
    if (section === "note") {
      return { url: isEdit ? `/api/checkins/${editor.id}` : "/api/checkins", method: isEdit ? "PATCH" : "POST",
        body: isEdit
          ? { title: form.title.trim(), date: form.date, note: form.note.trim() }
          : { title: form.title.trim(), date: form.date, habit_id: null } };
    }
    return { url: isEdit ? `${base}/${editor.id}` : base, method: isEdit ? "PATCH" : "POST",
      body: { title: form.title.trim(), description: form.description.trim(),
        target_date: form.target_date || null, status: form.status, progress: Number(form.progress) } };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("请输入标题"); return; }
    setSaving(true); setError(null);
    const { url, method, body } = endpoint();
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? `请求失败(${res.status})`); return; }
      onSaved(isEdit ? "已保存" : "已添加");
    } catch {
      setError("网络不可用");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true); setError(null);
    const base = SECTION_API[section];
    const url = section === "note" ? `/api/checkins/${editor.id}` : `${base}/${editor.id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? `删除失败(${res.status})`); return; }
      onSaved("已删除");
    } catch {
      setError("网络不可用");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {editor.checkinTabs && (
        <div className="seg modal-tabs">
          <button type="button" className={`seg-btn ${section === "habit" ? "active" : ""}`} onClick={() => onSwitchSection("habit")}>新建习惯</button>
          <button type="button" className={`seg-btn ${section === "note" ? "active" : ""}`} onClick={() => onSwitchSection("note")}>随手记一条</button>
        </div>
      )}
      <form onSubmit={submit} className="modal-form">
        <label className="modal-label">标题
          <input className="input" value={form.title} onChange={set("title")} maxLength={200} placeholder="标题" />
        </label>

        {section === "todo" && (
          <div className="modal-fields">
            <label className="modal-label">截止日期<input className="input" type="date" value={form.due_at} onChange={set("due_at")} /></label>
            <label className="modal-label">标签（逗号分隔）<input className="input" value={form.tags} onChange={set("tags")} /></label>
            <label className="modal-label">备注<textarea className="input" rows={2} value={form.content} onChange={set("content")} /></label>
          </div>
        )}
        {section === "event" && (
          <div className="modal-fields">
            <label className="modal-label">日期<input className="input" type="date" value={form.date} onChange={set("date")} /></label>
            <label className="modal-label">开始<input className="input" type="time" value={form.start} onChange={set("start")} /></label>
            <label className="modal-label">结束<input className="input" type="time" value={form.end} onChange={set("end")} /></label>
            <label className="modal-label">地点<input className="input" value={form.location} onChange={set("location")} /></label>
            <label className="modal-label">标签（逗号分隔）<input className="input" value={form.tags} onChange={set("tags")} /></label>
            <label className="modal-label">备注<textarea className="input" rows={2} value={form.content} onChange={set("content")} /></label>
          </div>
        )}
        {section === "habit" && (
          <label className="modal-label">标签（逗号分隔）<input className="input" value={form.tags} onChange={set("tags")} /></label>
        )}
        {section === "note" && (
          <div className="modal-fields">
            <label className="modal-label">日期<input className="input" type="date" value={form.date} onChange={set("date")} /></label>
            <label className="modal-label">备注<textarea className="input" rows={2} value={form.note} onChange={set("note")} /></label>
          </div>
        )}
        {section === "goal" && (
          <div className="modal-fields">
            <label className="modal-label">目标日期<input className="input" type="date" value={form.target_date} onChange={set("target_date")} /></label>
            <label className="modal-label">状态<select className="input" value={form.status} onChange={set("status")}>
              <option value="active">进行中</option><option value="done">已完成</option><option value="paused">搁置</option>
            </select></label>
            <label className="modal-label">进度 %<input className="input" type="number" min={0} max={100} value={form.progress} onChange={set("progress")} /></label>
            <label className="modal-label">描述<textarea className="input" rows={2} value={form.description} onChange={set("description")} /></label>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
          {isEdit && <button className="btn btn-danger" type="button" onClick={remove} disabled={saving}>删除</button>}
          <button className="btn" type="button" onClick={onClose}>取消</button>
        </div>
      </form>
    </Modal>
  );
}

const SECTION_LABEL: Record<Section, string> = {
  todo: "待办", event: "日程", habit: "习惯", note: "随手记", goal: "长期目标",
};
const SECTION_API: Record<Section, string> = {
  todo: "/api/todos", event: "/api/events", habit: "/api/habits", note: "/api/checkins", goal: "/api/goals",
};
