"use client";

/**
 * 响应式外壳（阶段 0 · 简约 UI 基底）
 * 视图归属（用户已澄清）：手机与平板都走「轻视图」；笔记本走完整工作台
 * - 轻视图（手机/平板）：输入框 + 列表 + 对话页 + 周报页，底部导航 4 项，
 *   不出现长文档编辑、审批台、设置迷宫
 * - 工作台（笔记本）：窄侧栏 + 主工作区 + 审批台
 * - 判定：移动 UA（含 HarmonyOS/Android/iPad）或触摸主指针 → 轻视图；
 *   其余 → 工作台。判定在客户端首帧后完成
 * - 未登录（/api/features 返回 401）自动跳 /login
 * - 占位按钮点击提示「该功能待定义」
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceholderButton from "./PlaceholderButton";
import EmptyState from "./EmptyState";
import type { FeatureModule } from "@/features";

type View = "inbox" | "chat" | "weekly" | "approve" | "settings";
type Mode = "light" | "desktop";

const STATUS_LABEL: Record<FeatureModule["status"], string> = {
  implemented: "已实做",
  placeholder: "占位",
  pending_clarify: "待澄清",
};

/** 手机 / 平板（含鸿蒙）判定为轻视图设备 */
function detectLightMode(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // 移动 / 平板 UA：Android、iPhone、iPad、鸿蒙 ArkWeb、Tablet 等
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS|ArkWeb|Tablet/i.test(ua)) return true;
  // 兜底：主指针为触摸（多数平板浏览器）
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
    return true;
  }
  return false;
}

export default function AppShell() {
  const router = useRouter();
  const [view, setView] = useState<View>("inbox");
  const [features, setFeatures] = useState<FeatureModule[] | null>(null);
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setMode(detectLightMode() ? "light" : "desktop");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/features")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!cancelled && res.ok) {
          setFeatures(data.features ?? []);
          setAuthed(true);
        }
      })
      .catch(() => {
        // 网络错误时停留在空状态，不额外打扰
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const navItems: { key: View; label: string; light: boolean }[] = [
    { key: "inbox", label: "记录", light: true },
    { key: "chat", label: "对话", light: true },
    { key: "weekly", label: "周报", light: true },
    { key: "settings", label: "我的", light: true },
    { key: "approve", label: "审批台", light: false }, // 审批台只在笔记本端
  ];

  // 设备类型判定完成前显示极简加载态，避免视图闪跳
  if (mode === null) {
    return (
      <div className="shell detecting">
        <main className="main">
          <div className="main-inner">
            <p className="muted">载入中…</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`shell ${mode === "light" ? "light" : "desktop"}`}>
      {/* 电脑端窄侧栏 */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">归匣</span>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-nav-item ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <PlaceholderButton label="整理新笔记" />
        </div>
      </aside>

      {/* 主工作区 */}
      <main className="main">
        <div className="main-inner">
          {view === "inbox" && <InboxView />}
          {view === "chat" && <ChatView />}
          {view === "weekly" && <WeeklyView />}
          {view === "approve" && <ApproveView />}
          {view === "settings" && <SettingsView features={features} authed={authed} />}
        </div>
      </main>

      {/* 轻视图底部导航（4 项，仅手机/平板） */}
      <nav className="bottomnav">
        {navItems
          .filter((i) => i.light)
          .map((item) => (
            <button
              key={item.key}
              type="button"
              className={`bottomnav-item ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
      </nav>
    </div>
  );
}

/* ---------- 各视图（阶段 0 均为基底 + 占位） ---------- */

function InboxView() {
  const [draft, setDraft] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // 统一收件箱待澄清：此处不发送任何请求
    setDraft("");
  }

  return (
    <section>
      <h1 className="view-title">收件箱</h1>
      <p className="view-desc">想法、待办、随手问——先记下来，分类以后再说。</p>
      <form className="capture-row" onSubmit={submit}>
        <input
          className="input"
          placeholder="随手记一条…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <PlaceholderButton label="记一条" hint="统一收件箱待定义：分类路由细节澄清后实现" primary />
      </form>
      <EmptyState text="还没有内容，先记一条" />
    </section>
  );
}

function ChatView() {
  return (
    <section>
      <h1 className="view-title">对话</h1>
      <p className="view-desc">统一人设与记忆的 AI 对话（待澄清后实现）。</p>
      <div className="chat-area panel">
        <EmptyState text="AI 对话待定义" />
      </div>
      <div className="capture-row">
        <input className="input" placeholder="输入框占位——AI 对话待定义" disabled />
        <PlaceholderButton label="发送" hint="AI 对话待定义" />
      </div>
    </section>
  );
}

function WeeklyView() {
  return (
    <section>
      <h1 className="view-title">周报</h1>
      <p className="view-desc">每周自动生成草稿，经你批准后发布（不自动发布）。</p>
      <EmptyState text="本周还没有周报草稿" />
      <div className="action-row">
        <PlaceholderButton label="生成周报草稿" hint="周报功能待定义" />
      </div>
    </section>
  );
}

function ApproveView() {
  return (
    <section>
      <h1 className="view-title">审批台</h1>
      <p className="view-desc">移动端提交的操作请求，先快照、再审批、再应用。</p>
      <EmptyState text="没有待审批的操作" />
    </section>
  );
}

function SettingsView({
  features,
  authed,
}: {
  features: FeatureModule[] | null;
  authed: boolean;
}) {
  return (
    <section>
      <h1 className="view-title">我的</h1>
      <p className="view-desc">模块状态一览（与 MODULES.md 同步维护）。</p>

      <div className="feature-list panel">
        {authed && features === null && <p className="muted">加载中…</p>}
        {!authed && <p className="muted">未登录</p>}
        {features?.map((f) => (
          <div key={f.id} className="feature-row">
            <span className="feature-name">{f.name}</span>
            <span className={`tag ${f.status === "implemented" ? "tag-implemented" : ""}`}>
              {STATUS_LABEL[f.status]}
            </span>
          </div>
        ))}
      </div>

      <div className="action-row">
        <PlaceholderButton label="立即备份" hint="备份功能待定义" />
      </div>
      <p className="muted footnote">阶段 0：仅框架与占位，不含业务逻辑</p>
    </section>
  );
}
