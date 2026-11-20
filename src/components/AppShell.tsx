"use client";

/**
 * 应用外壳（v0.6 · 入口重构）
 * - 侧边栏在右；点击侧栏切页（非单页滚动）——清单第七节
 * - 「记录与规划」一个导航项，内部 tab 切 待办/日程/打卡/备忘录/长期目标（用户 2026-11-19 确认，保留）
 * - 首页改版：单列从上到下多个实内容分区、垂直滚动、就地 + 号弹框编辑
 * - 侧栏仍是点击切页；首页内部的「查看全部 →」跳到「记录与规划」对应 tab
 * - 一期只做电脑端；未登录跳 /login
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceholderButton from "./PlaceholderButton";
import EmptyState from "./EmptyState";
import TodoView from "./TodoView";
import EventView from "./EventView";
import CheckinView from "./CheckinView";
import GoalView from "./GoalView";
import ChatView from "./ChatView";
import HomeDashboard from "./HomeDashboard";
import MemorySettings from "./MemorySettings";
import IndexSettings from "./IndexSettings";
import type { FeatureModule } from "@/features";

type Page = "home" | "records" | "chat" | "assistant" | "knowledge" | "settings";
type RecordTab = "todo" | "event" | "checkin" | "memo" | "goal";

const NAV: { key: Page; label: string; phase: string }[] = [
  { key: "home", label: "首页", phase: "一期" },
  { key: "records", label: "记录与规划", phase: "一期" },
  { key: "chat", label: "AI 对话", phase: "一期" },
  { key: "assistant", label: "AI 管家", phase: "一期" },
  { key: "knowledge", label: "知识库", phase: "二期" },
  { key: "settings", label: "设置", phase: "骨架" },
];

const RECORD_TABS: { key: RecordTab; label: string }[] = [
  { key: "todo", label: "待办" },
  { key: "event", label: "日程" },
  { key: "checkin", label: "打卡" },
  { key: "memo", label: "备忘录" },
  { key: "goal", label: "长期目标" },
];

export default function AppShell() {
  const router = useRouter();
  const [page, setPage] = useState<Page>("home");
  const [recordTab, setRecordTab] = useState<RecordTab>("todo");
  const [features, setFeatures] = useState<FeatureModule[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/features")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!cancelled && res.ok) setFeatures(data.features ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [router]);

  function openRecords(tab: RecordTab) {
    setRecordTab(tab);
    setPage("records");
  }

  return (
    <div className="shell">
      <main className="main">
        <div className="main-inner">
          {page === "home" && <HomeDashboard onOpen={openRecords} />}
          {page === "records" && (
            <RecordsPage tab={recordTab} setTab={setRecordTab} />
          )}
          {page === "chat" && <ChatView />}
          {page === "assistant" && (
            <SimplePage title="AI 管家" desc="管家/秘书身份，只处理站内问题；常用功能做成按钮（A9 实现）" />
          )}
          {page === "knowledge" && (
            <SimplePage title="知识库" desc="知识库 / 项目库看板 + 文件浏览器（二期）" />
          )}
          {page === "settings" && <SettingsPage features={features} />}
        </div>
      </main>

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" />
          <span className="brand-name">Fold 归匣</span>
        </div>
        <nav className="side-nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`side-nav-item ${page === item.key ? "active" : ""}`}
              onClick={() => setPage(item.key)}
            >
              <span>{item.label}</span>
              <span className="nav-phase">{item.phase}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button
            type="button"
            className="side-logout"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              router.replace("/login");
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
    </div>
  );
}

/** 记录与规划：一个入口 + 五个 tab */
function RecordsPage({ tab, setTab }: { tab: RecordTab; setTab: (t: RecordTab) => void }) {
  return (
    <section>
      <div className="seg record-tabs">
        {RECORD_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`seg-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="record-panel">
        {tab === "todo" && <TodoView />}
        {tab === "event" && <EventView />}
        {tab === "checkin" && <CheckinView />}
        {tab === "memo" && (
          <SimplePage title="备忘录" desc="随手记的碎片与备忘（待实现）" />
        )}
        {tab === "goal" && <GoalView />}
      </div>
    </section>
  );
}


function SimplePage({ title, desc }: { title: string; desc: string }) {
  return (
    <section>
      <h1 className="view-title">{title}</h1>
      <p className="view-desc">{desc}</p>
      <div className="panel page-placeholder">
        <EmptyState text="该功能待定义（按需求清单分期实现）" />
        <PlaceholderButton label="触发占位" hint="该功能待定义" />
      </div>
    </section>
  );
}

function SettingsPage({ features }: { features: FeatureModule[] | null }) {
  return (
    <section>
      <h1 className="view-title">设置</h1>
      <p className="view-desc">主题 / 配色 / 模块显隐 / 首页卡片顺序（P15：不做拖拽改结构）。</p>
      <div className="panel settings-block">
        <h2 className="settings-h2">模块状态（来自 features.ts）</h2>
        {features === null ? (
          <p className="muted">载入中…</p>
        ) : (
          <ul className="feature-list">
            {features.map((f) => (
              <li key={f.id} className="feature-row">
                <span className="feature-name">{f.name}</span>
                <span className="tag">{f.phase ?? "-"}</span>
                <span className="tag">{f.enabled ? f.status : "未启用"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MemorySettings />
      <IndexSettings />
    </section>
  );
}
