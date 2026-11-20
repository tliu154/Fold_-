"use client";

/**
 * 主页周报卡（三期 C3）
 * - 固定在首页最上方（五个分区之上）
 * - 默认折叠；**仅当产生新一周周报时自动展开一次**（localStorage 记已看过的周键）
 * - 角落「回顾」→ 弹框列历史 → 点击**新标签页**打开 HTML 周报（同源只读路由）
 * - 展开后内嵌 iframe 展示周报 HTML 本体（周报就是一份文件，不做第二份渲染）
 * - 旧周报绝不回主页
 */
import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";

interface ReportFile {
  id: string;
  title: string;
  week: string | null;
  status: string;
  created_at: string;
  filename: string;
}

const SEEN_KEY = "fold_report_seen_week";

export default function HomeReportCard() {
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reports").catch(() => null);
    if (!res?.ok) return;
    const d = await res.json().catch(() => ({}));
    const list = (d.reports ?? []) as ReportFile[];
    setReports(list);
    const latest = list[0];
    if (latest?.week) {
      let seen = "";
      try { seen = localStorage.getItem(SEEN_KEY) ?? ""; } catch { /* 隐私模式忽略 */ }
      if (seen !== latest.week) {
        setExpanded(true);
        try { localStorage.setItem(SEEN_KEY, latest.week); } catch { /* ignore */ }
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latest = reports[0] ?? null;

  async function generate() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useAi: true }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({})) ?? {};
    if (!res?.ok) setNotice(`生成失败：${d.error ?? "未知错误"}`);
    else {
      setNotice(d.reused ? "本周周报已存在，已直接复用。" : "周报已生成，可在下方查看。");
      setExpanded(true);
      await load();
    }
    setBusy(false);
  }

  function openRaw(id: string) {
    window.open(`/api/internal-files/raw?id=${encodeURIComponent(id)}`, "_blank", "noopener");
  }

  return (
    <div className="report-card panel">
      <div className="report-head">
        <div className="report-head-left">
          <button type="button" className="report-toggle" onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}>
            <span className="report-caret">{expanded ? "▾" : "▸"}</span>
            <span className="report-title">本周周报</span>
          </button>
          {latest ? (
            <span className="report-week muted">
              {latest.week ?? "—"} · {latest.created_at.slice(0, 10)}
              {latest.status === "unsorted" && <span className="tag">待整理</span>}
              {latest.status === "filed" && <span className="tag">已归档</span>}
            </span>
          ) : <span className="muted">还没有周报</span>}
        </div>
        <div className="report-head-actions">
          <button type="button" className="btn btn-sm" onClick={generate} disabled={busy}>
            {busy ? "生成中…" : "生成本周周报"}
          </button>
          <button type="button" className="home-all" onClick={() => setReview(true)}>回顾</button>
        </div>
      </div>

      {notice && <p className="form-notice">{notice}</p>}

      {expanded && (
        <div className="report-body">
          {latest ? (
            <>
              <div className="report-frame-wrap">
                <iframe
                  title={`周报 ${latest.week ?? latest.id}`}
                  src={`/api/internal-files/raw?id=${encodeURIComponent(latest.id)}`}
                  className="report-frame"
                  sandbox="allow-same-origin"
                />
              </div>
              <div className="report-foot">
                <button type="button" className="home-all" onClick={() => openRaw(latest.id)}>
                  在新标签页打开 →
                </button>
                <span className="muted">周报是一份 HTML 文件，整理批准后才分流到用户加入的库</span>
              </div>
            </>
          ) : (
            <p className="muted">本周还没有周报。可点「生成本周周报」，或等每周定时任务自动生成。</p>
          )}
        </div>
      )}

      {review && (
        <Modal title="历史周报回顾" onClose={() => setReview(false)}>
          {reports.length === 0 ? <p className="muted">还没有生成过周报。</p> : (
            <div className="report-review-list">
              {reports.map((r) => (
                <button type="button" key={r.id} className="report-review-item"
                  onClick={() => openRaw(r.id)}>
                  <span className="home-item-title">{r.title}</span>
                  <span className="muted home-item-meta">
                    {r.week ?? "—"} · {r.created_at.slice(0, 10)} · {r.status === "filed" ? "已归档" : "待整理"}
                  </span>
                  <span className="muted">新标签页打开 ↗</span>
                </button>
              ))}
            </div>
          )}
          <p className="muted">点击任意一条会在浏览器新标签页打开对应 HTML 文件；旧周报不会显示在主页。</p>
        </Modal>
      )}
    </div>
  );
}
