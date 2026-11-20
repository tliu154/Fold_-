"use client";

/**
 * AI 对话页（一期 A6）
 * - 两种模式：临时模式(Stateless 不落库) / 普通模式(多会话、保留最近 10 轮)
 * - 左栏会话列表：新建 / 切换 / 重命名 / 删除 / 清空
 * - 一次性返回文本（非流式）；不自动存回答（「记下来」属 A10）
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";
import CapturePanel from "./CapturePanel";

type Mode = "temp" | "normal";
interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}
interface Msg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export default function ChatView() {
  const [mode, setMode] = useState<Mode>("normal");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tempMessages, setTempMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat/sessions").catch(() => null);
    if (res?.status === 401) { window.location.href = "/login"; return; }
    const data = res ? await res.json().catch(() => ({ sessions: [] })) : { sessions: [] };
    setSessions(data.sessions ?? []);
    return data.sessions as Session[];
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/sessions/${id}/messages`);
    if (res.ok) setMessages((await res.json()).messages ?? []);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function newSession() {
    setError(null);
    const res = await fetch("/api/chat/sessions", { method: "POST" });
    if (!res.ok) { setError("新建会话失败"); return; }
    const { session } = await res.json();
    await loadSessions();
    setActiveId(session.id);
    setMessages([]);
  }

  async function switchSession(id: string) {
    setActiveId(id);
    setError(null);
    await loadMessages(id);
  }

  async function doRename(id: string) {
    if (!renameValue.trim()) { setRenaming(null); return; }
    const res = await fetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: renameValue.trim() }),
    });
    setRenaming(null);
    if (!res.ok) { setError("重命名失败"); return; }
    await loadSessions();
  }

  async function removeSession(id: string) {
    const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("删除会话失败"); return; }
    if (activeId === id) { setActiveId(null); setMessages([]); }
    await loadSessions();
  }

  async function clearActive() {
    if (!activeId) return;
    const res = await fetch(`/api/chat/sessions/${activeId}/clear`, { method: "POST" });
    if (!res.ok) { setError("清空失败"); return; }
    setMessages([]);
    await loadSessions();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    if (mode === "normal" && !activeId) { setError("请先新建或选择一个会话"); return; }
    setError(null);
    setSending(true);

    // 临时模式本地即时显示用户消息；普通模式等服务端落库后统一刷新
    if (mode === "temp") {
      setTempMessages((m) => [...m, {
        id: `local-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString(),
      }]);
    } else {
      setMessages((m) => [...m, {
        id: `local-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString(),
      }]);
    }
    setInput("");

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, session_id: mode === "normal" ? activeId : undefined, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `请求失败(${res.status})`);
        if (mode === "normal" && activeId) await loadMessages(activeId);
        else setTempMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
        return;
      }
      if (mode === "temp") {
        setTempMessages((m) => [...m, {
          id: `reply-${Date.now()}`, role: "assistant", content: data.reply,
          created_at: new Date().toISOString(),
        }]);
      } else {
        await loadMessages(activeId!);
        await loadSessions();
      }
    } catch {
      setError("网络不可用或模型调用失败");
      if (mode === "normal" && activeId) await loadMessages(activeId);
      else setTempMessages((m) => m.filter((x) => !x.id.startsWith("local-")));
    } finally {
      setSending(false);
    }
  }

  const shown = mode === "temp" ? tempMessages : messages;

  return (
    <section>
      <h1 className="view-title">AI 对话</h1>
      <p className="view-desc">
        普通模式保留最近 10 轮上下文、多个会话互不串台；临时模式不落库、不留痕迹。
      </p>

      <div className="todo-toolbar">
        <div className="seg">
          <button type="button" className={`seg-btn ${mode === "normal" ? "active" : ""}`} onClick={() => setMode("normal")}>普通模式</button>
          <button type="button" className={`seg-btn ${mode === "temp" ? "active" : ""}`} onClick={() => setMode("temp")}>临时模式</button>
        </div>
        {mode === "normal" && (
          <div className="chat-toolbar-actions">
            <button type="button" className="btn btn-sm" onClick={newSession}>新建会话</button>
            <button type="button" className="btn btn-sm" onClick={clearActive} disabled={!activeId}>清空</button>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {mode === "normal" && activeId && <CapturePanel sessionId={activeId} messages={messages} />}

      <div className="chat-layout">
        {mode === "normal" && (
          <aside className="chat-sessions">
            {sessions.length === 0 ? (
              <p className="muted chat-sessions-empty">还没有会话，点「新建会话」开始</p>
            ) : (
              <ul className="chat-session-list">
                {sessions.map((s) => (
                  <li key={s.id} className={`chat-session ${activeId === s.id ? "active" : ""}`}>
                    {renaming === s.id ? (
                      <form className="chat-rename" onSubmit={(ev) => { ev.preventDefault(); doRename(s.id); }}>
                        <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                      </form>
                    ) : (
                      <button type="button" className="chat-session-title" onClick={() => switchSession(s.id)}>
                        {s.title}
                      </button>
                    )}
                    <div className="chat-session-actions">
                      <button type="button" className="chat-mini" title="重命名" onClick={() => { setRenaming(s.id); setRenameValue(s.title); }}>改名</button>
                      <button type="button" className="chat-mini" title="删除" onClick={() => removeSession(s.id)}>删除</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        <div className="chat-main">
          <div className="chat-messages">
            {shown.length === 0 ? (
              <EmptyState text={mode === "temp" ? "临时对话，不留痕迹" : "还没有消息，发一句试试"} />
            ) : (
              shown.map((m) => (
                <div key={m.id} className={`chat-msg ${m.role}`}>
                  <div className="chat-msg-role">{m.role === "user" ? "我" : "AI"}</div>
                  <div className="chat-msg-content">{m.content}</div>
                </div>
              ))
            )}
            {sending && <p className="muted chat-sending">正在回复…</p>}
          </div>

          <form className="chat-input-row" onSubmit={send}>
            <textarea
              className="input chat-input"
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行）"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e as unknown as React.FormEvent); }
              }}
              rows={2}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !input.trim()}>发送</button>
          </form>
        </div>
      </div>
    </section>
  );
}
