/**
 * 同步客户端（阶段 1 实装，仅移动端轻视图使用）
 * - push：把本地 queued 状态的 op 批量投递（幂等，重复返回 duplicate）
 * - pull：拉取只读快照，整体替换本地缓存
 * - 触发策略（已确认）：打开 app 自动 pull 一次 + 联网自动 push + 手动「同步」按钮兜底
 */
import {
  getDeviceId,
  listOps,
  listItems,
  saveSnapshot,
  updateOpStatus,
  pruneSyncedOps,
  type LocalItem,
  type LocalOp,
} from "./localDb";

export interface SyncReport {
  pushed: number;
  pulled: boolean;
  version?: number;
  unauthorized?: boolean;
  error?: string;
}

interface JsonResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<JsonResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    let data: T | undefined;
    try {
      data = (await res.json()) as T;
    } catch {
      // 无 body 的响应（如 500 返回 HTML）
    }
    if (res.ok) return { ok: true, status: res.status, data };
    // 透传服务端 error 字段 + 状态码，避免只显示笼统的「请求失败」难以排障
    const serverError =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : undefined;
    const detail = serverError ? `请求失败(${res.status})：${serverError}` : `请求失败(${res.status})`;
    return { ok: false, status: res.status, data, error: detail };
  } catch {
    return { ok: false, status: 0, error: "网络不可用" };
  }
}

/** 投递本地 queued 的 op（登录态失效时返回 unauthorized） */
export async function pushOps(): Promise<{ count: number; unauthorized?: boolean; error?: string }> {
  const ops = (await listOps()).filter((o) => o.status === "queued");
  if (ops.length === 0) return { count: 0 };

  const deviceId = await getDeviceId();
  const wire = ops.map((o) => ({
    op_id: o.op_id,
    device_id: o.device_id,
    type: o.type,
    target_id: o.target_id,
    item_type: o.item_type,
    payload: o.payload,
    base_version: o.base_version,
    client_seq: o.client_seq,
    created_at: o.created_at,
  }));

  const res = await jsonFetch<{
    results: { op_id: string; status: string; reject_reason?: string }[];
    snapshot_version: number;
  }>("/api/sync/push", { method: "POST", body: JSON.stringify({ device_id: deviceId, ops: wire }) });

  if (res.status === 401) return { count: 0, unauthorized: true };
  if (!res.ok || !res.data) return { count: 0, error: res.error ?? "投递失败" };

  for (const r of res.data.results) {
    // 服务端状态 → 本地队列状态
    const local =
      r.status === "conflict"
        ? "conflict"
        : r.status === "duplicate"
          ? "duplicate"
          : "synced"; // pending / auto_applied 都算已提交
    await updateOpStatus(r.op_id, local, r.reject_reason);
  }

  return { count: ops.length };
}

/** 拉取只读快照并整体替换本地缓存 */
export async function pullSnapshot(): Promise<{
  version?: number;
  unauthorized?: boolean;
  error?: string;
}> {
  const deviceId = await getDeviceId();
  const res = await jsonFetch<{
    version: number;
    items: LocalItem[];
    profile: Record<string, unknown>;
    generated_at: string;
  }>(`/api/sync/snapshot?device_id=${encodeURIComponent(deviceId)}`);

  if (res.status === 401) return { unauthorized: true };
  if (!res.ok || !res.data) return { error: res.error ?? "拉取失败" };

  await saveSnapshot(res.data.version, res.data.generated_at, res.data.items);
  await pruneSyncedOps(res.data.items);
  return { version: res.data.version };
}

/** 手动/自动同步：先 push 再 pull */
export async function syncNow(): Promise<SyncReport> {
  const push = await pushOps();
  if (push.unauthorized) {
    return { pushed: 0, pulled: false, unauthorized: true };
  }
  const pull = await pullSnapshot();
  if (pull.unauthorized) {
    return { pushed: push.count, pulled: false, unauthorized: true };
  }
  return {
    pushed: push.count,
    pulled: !pull.error,
    version: pull.version,
    error: push.error ?? pull.error,
  };
}

/** 轻视图列表条目：快照条目 或 本地 op（草稿/待审批/冲突） */
export interface InboxEntry {
  kind: "item" | "op";
  item?: LocalItem;
  op?: LocalOp;
}

/** 轻视图列表数据：快照条目 + 本地 op 合并 */
export async function loadInboxEntries(): Promise<InboxEntry[]> {
  const [items, ops] = await Promise.all([listItems(), listOps()]);
  const entries: InboxEntry[] = [];

  // 快照条目（最新在前）
  for (const item of items) {
    entries.push({ kind: "item", item });
  }
  // 本地 op：待投递 / 冲突 / 被驳回的草稿（已提交且条目未入库的也显示）
  const itemIds = new Set(items.map((i) => i.id));
  for (const op of ops) {
    if (op.status === "queued" || op.status === "conflict" || op.status === "rejected") {
      entries.push({ kind: "op", op });
    } else if (op.status === "synced" && op.type === "create") {
      const itemId = (op.payload as { id?: string }).id;
      if (!itemId || !itemIds.has(itemId)) {
        entries.push({ kind: "op", op });
      }
    }
  }
  return entries;
}
