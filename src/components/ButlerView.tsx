"use client";

/**
 * AI 管家页（一期 A9）
 * - 管家/秘书身份，只处理站内问题；超出范围婉拒
 * - 四个常用功能按钮：点击填入输入框，不自动发送
 * - 简单问答无状态（不落库）；「开会话」复用 A6 chat_session 带上下文
 * - 能力：assistant 记忆映射 + A8 三个检索工具（服务端处理）
 */
import { useCallback, useEffect, useState } from "react";
import EmptyState from "./EmptyState";

const QUICK = [
  "今天有什么待办？",
  "最近有什么日程？",
  "我的笔记里有哪些关于微积分的内容？",
  "统计一下我的笔记数量和分布。",
];

interface Msg { id: string; role: "user" | "assistant"; content: string; }
interface Session { id: string; title: string; message_count: number; }

export default function ButlerView() {
  const [sessionMode, setSessionMode] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/chat/sessions").then((r) => r.json()).then((d) => {
      // 只展示最近一个会话作为「当前会话」，不列全量（管家页保持简单）
      const list = d.sessions ?? [];
      if (list[0]) { setSession(list[0]); }
    }).catch(() => {});
  }, []);

  async function toggleSession() {
    setError(null);
    if (sessionMode) { setSessionMode(false); setSession(null); setMessages([]); return; }
    const res = await fetch("/api/chat/sessions", { method: "POST" });
    if (!res.ok) { setError("开会话失败"); return; }
    const { session: s } = await res.json();
    setSession(s);
    setSessionMode(true);
    setMessages([]);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || sending) return;
    if (sessionMode && !session) { setError("会话未就绪"); return; }
    setError(null); setSending(true);
    setInput("");
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: q }]);

    try {
      const res = await fetch("/api/butler/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          mode: sessionMode ? "session" : "stateless",
          session_id: sessionMode ? session?.id : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? `请求失败(${res.status})`);
        setMessages((m) => m.filter((x) => !x.id.startsWith("u-")));
        return;
      }
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: d.reply }]);
      if (sessionMode) {
        const listRes = await fetch("/api/chat/sessions").then((r) => r.json()).catch(() => ({ sessions: [] as Session[] }));
        const fresh = ((listRes.sessions ?? []) as Session[]).find((s) => s.id === session?.id);
        if (fresh) setSession(fresh);
      }
    } catch {
      setError("网络不可用或管家调用失败");
      setMessages((m) => m.filter((x) => !x.id.startsWith("u-")));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <h1 className="view-title">AI 管家</h1>
      <p className="view-desc">管家/秘书身份，只处理本站事务（待办 / 日程 / 打卡 / 长期目标 / 笔记检索 / 设置）；超出范围会礼貌婉拒。简单问答不留痕迹。</p>

      <div className="todo-toolbar">
        <span className="muted">{sessionMode ? `会话模式 · ${session?.title ?? "新会话"}` : "无状态模式 · 问答不落库"}</span>
        <button type="button" className="btn btn-sm" onClick={toggleSession}>
          {sessionMode ? "结束会话" : "开会话（复杂任务）"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="butler-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn btn-sm" onClick={() => setInput(q)}>{q}</button>
        ))}
      </div>
      <p className="muted butler-quick-hint">点击上方按钮把问题填入输入框，可修改后再发送。</p>

      <div className="chat-layout">
        <div className="chat-main butler-main">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <EmptyState text="问我站内的事，比如「今天有什么待办」" />
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.role === "user" ? "user" : "assistant"}`}>
                  <div className="chat-msg-role">{m.role === "user" ? "我" : "管家"}</div>
                  <div className="chat-msg-content">{m.content}</div>
                </div>
              ))
            )}
            {sending && <p className="muted chat-sending">管家正在处理…</p>}
          </div>
          <form className="chat-input-row" onSubmit={send}>
            <textarea
              className="input chat-input"
              placeholder="输入站内问题…（Enter 发送，Shift+Enter 换行）"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
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
