"use client";

/**
 * 应用外壳（v0.6 骨架）
 * - 侧边栏在右；点击侧栏切页（非单页滚动）——清单第七节
 * - 一期只做电脑端：不做轻视图 / 底部导航 / UA 检测
 * - 未登录（/api/features 返回 401）自动跳 /login
 * - 各页面为骨架占位；具体功能按清单 3.1 走澄清门后实现
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceholderButton from "./PlaceholderButton";
import EmptyState from "./EmptyState";
import TodoView from "./TodoView";
import type { FeatureModule } from "@/features";

type Page = "home" | "todo" | "assistant" | "schedule" | "knowledge" | "settings";

const NAV: { key: Page; label: string; phase: string }[] = [
  { key: "home", label: "首页", phase: "一期" },
  { key: "todo", label: "待办", phase: "一期" },
  { key: "assistant", label: "AI 管家", phase: "一期" },
  { key: "schedule", label: "日程 / 打卡", phase: "一期" },
  { key: "knowledge", label: "知识库", phase: "二期" },
  { key: "settings", label: "设置", phase: "骨架" },
];

export default function AppShell() {
  const router = useRouter();
  const [page, setPage] = useState<Page>("home");
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
      .catch(() => {
        // 网络错误时停留在骨架，不打扰
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="shell">
      <main className="main">
        <div className="main-inner">
          {page === "home" && <HomeDashboard onOpenTodo={() => setPage("todo")} />}
          {page === "todo" && <TodoView />}
          {page === "assistant" && (
            <SimplePage title="AI 管家" desc="管家问答 + 普通对话 + 三层记忆 + 检索工具（一期）" />
          )}
          {page === "schedule" && <SimplePage title="日程 / 打卡" desc="网站自建主库的日程与打卡（一期）" />}
          {page === "knowledge" && <SimplePage title="知识库" desc="知识库 / 项目库看板 + 文件浏览器（二期）" />}
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

/** 首页仪表盘（待办已实做，其余骨架占位） */
function HomeDashboard({ onOpenTodo }: { onOpenTodo: () => void }) {
  const cards = [
    { title: "待办", desc: "网站自建主库", hint: "点击进入 →", ready: true },
    { title: "日程", desc: "网站自建主库", hint: "一期实现", ready: false },
    { title: "打卡", desc: "网站自建主库", hint: "一期实现", ready: false },
    { title: "长期目标", desc: "本地配置手填", hint: "一期实现", ready: false },
  ];
  return (
    <section>
      <h1 className="view-title">首页</h1>
      <p className="view-desc">整合 + 调度 + 自动化的个人指挥台。功能按清单分期实现。</p>
      <div className="dash-grid">
        {cards.map((c) => (
          <button
            key={c.title}
            type="button"
            className={`panel dash-card ${c.ready ? "dash-card-ready" : ""}`}
            onClick={c.ready ? onOpenTodo : undefined}
            disabled={!c.ready}
          >
            <div className="dash-card-title">{c.title}</div>
            <div className="muted">{c.desc}</div>
            <div className="dash-card-hint">{c.hint}</div>
          </button>
        ))}
      </div>
      <div className="panel home-tip">
        <EmptyState text="待办已实做；其余功能按你定的顺序逐个实现（每个都先走澄清门）。" />
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
    </section>
  );
}
