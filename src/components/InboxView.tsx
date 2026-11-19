"use client";

/**
 * 收件箱视图（阶段 1 实装）
 * - 轻视图（手机/平板）：「记一条」→ 本地 op 队列 → 自动 push（联网时）→ 打开时自动 pull；
 *   手动「同步」按钮兜底。列表 = 快照条目 + 本地 op（草稿/待审批/冲突）合并
 * - 笔记本端：只读列表（读 /api/sync/snapshot）+ 占位「记一条」
 *   （工作台 CRUD 属后续功能，实现前先走澄清门）
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlaceholderButton from "./PlaceholderButton";
import EmptyState from "./EmptyState";
import {
  getDeviceId,
  getMeta,
  nextClientSeq,
  enqueueOp,
  type LocalOp,
  type LocalItem,
} from "@/lib/localDb";
import { loadInboxEntries, pushOps, syncNow, type InboxEntry } from "@/lib/syncClient";

const OP_STATUS_LABEL: Record<LocalOp["status"], string> = {
  queued: "未同步",
  synced: "已提交 · 待审批",
  conflict: "冲突",
  duplicate: "重复",
  rejected: "已驳回（草稿）",
};

export default function InboxView({ mode }: { mode: "light" | "desktop" }) {
  if (mode === "light") return <LightInbox />;
  return <DesktopInbox />;
}

/* ================= 轻视图（手机 / 平板） ================= */

function LightInbox() {
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<InboxEntry[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setEntries(await loadInboxEntries());
    setLastSync((await getMeta<string>("last_sync_at")) ?? null);
  }, []);

  useEffect(() => {
    // 打开 app：先显示本地数据，再自动同步（push + pull）
    reload();
    syncNow().then((r) => {
      if (r.unauthorized) {
        window.location.href = "/login";
        return;
      }
      reload();
    });

    // 联网自动投递
    const onOnline = () => {
      syncNow().then(() => reload());
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reload]);

  const unsyncedCount = (entries ?? []).filter(
    (e) => e.kind === "op" && e.op?.status === "queued"
  ).length;

  async function handleCapture(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;

    const deviceId = await getDeviceId();
    const seq = await nextClientSeq();
    const baseVersion = (await getMeta<number>("snapshot_version")) ?? 0;

    const op: LocalOp = {
      op_id: crypto.randomUUID(),
      device_id: deviceId,
      type: "create",
      target_id: null,
      item_type: "note", // 已确认：阶段 1 固定 note，分类路由留给阶段 2
      payload: {
        id: crypto.randomUUID(),
        title: content.slice(0, 40),
        content,
      },
      base_version: baseVersion,
      client_seq: seq,
      created_at: new Date().toISOString(),
      status: "queued",
    };

    await enqueueOp(op);
    setText("");
    await reload();

    // 联网时自动投递（2 次点击内完成记录；同步是后台动作）
    if (navigator.onLine) {
      const r = await pushOps();
      if (r.unauthorized) {
        window.location.href = "/login";
        return;
      }
      await reload();
    }
  }

  async function handleSync() {
    setSyncing(true);
    setNote(null);
    try {
      const r = await syncNow();
      if (r.unauthorized) {
        window.location.href = "/login";
        return;
      }
      if (r.error) setNote(`同步失败：${r.error}`);
      await reload();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section>
      <h1 className="view-title">记录</h1>
      <p className="view-desc">随手记一条，同步与审批交给后台。</p>

      <form className="capture-row" onSubmit={handleCapture}>
        <input
          className="input"
          placeholder="随手记一条…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          记一条
        </button>
      </form>

      <div className="sync-row">
        <span className="muted sync-info">
          {syncing
            ? "同步中…"
            : unsyncedCount > 0
              ? `${unsyncedCount} 条未同步`
              : lastSync
                ? `已同步 · ${formatTime(lastSync)}`
                : "尚未同步"}
        </span>
        <button className="btn" type="button" onClick={handleSync} disabled={syncing}>
          同步
        </button>
      </div>
      {note && <p className="muted">{note}</p>}

      {entries === null ? (
        <p className="muted">载入中…</p>
      ) : entries.length === 0 ? (
        <EmptyState text="还没有内容，先记一条" />
      ) : (
        <ul className="entry-list">
          {entries.map((entry) =>
            entry.kind === "item" ? (
              <EntryItemRow key={`i-${entry.item!.id}`} item={entry.item!} />
            ) : (
              <EntryOpRow key={`o-${entry.op!.op_id}`} op={entry.op!} />
            )
          )}
        </ul>
      )}
    </section>
  );
}

function EntryItemRow({ item }: { item: LocalItem }) {
  return (
    <li className="entry-item">
      <div className="entry-main">
        <span className="entry-title">{item.title ?? "(无标题)"}</span>
        <span className="muted entry-time">{formatTime(item.updated_at)}</span>
      </div>
      <span className="tag">{item.type}</span>
    </li>
  );
}

function EntryOpRow({ op }: { op: LocalOp }) {
  const title = (op.payload as { title?: string }).title ?? "(草稿)";
  return (
    <li className={`entry-item entry-local op-${op.status}`}>
      <div className="entry-main">
        <span className="entry-title">{title}</span>
        <span className="muted entry-time">{formatTime(op.created_at)}</span>
      </div>
      <span className={`tag ${op.status === "conflict" || op.status === "rejected" ? "tag-warn" : ""}`}>
        {OP_STATUS_LABEL[op.status]}
      </span>
    </li>
  );
}

/* ================= 笔记本端（只读列表 + 占位） ================= */

function DesktopInbox() {
  const router = useRouter();
  const [items, setItems] = useState<LocalItem[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/sync/snapshot")
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        setItems(data.items ?? []);
        setVersion(data.version ?? null);
      })
      .catch(() => setItems([]));
  }, [router]);

  return (
    <section>
      <h1 className="view-title">收件箱</h1>
      <p className="view-desc">
        只读视图（库版本 v{version ?? "-"}）。工作台编辑属后续功能，实现前先走澄清门。
      </p>
      <div className="capture-row">
        <input className="input" placeholder="随手记一条…" disabled />
        <PlaceholderButton label="记一条" hint="工作台录入待澄清后实现（移动端可记）" primary />
      </div>
      {items === null ? (
        <p className="muted">载入中…</p>
      ) : items.length === 0 ? (
        <EmptyState text="还没有内容，先用手机记一条试试" />
      ) : (
        <ul className="entry-list">
          {items.map((item) => (
            <EntryItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================= 工具 ================= */

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
