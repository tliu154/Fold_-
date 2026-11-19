/**
 * 移动端本地存储（阶段 1 实装）
 * IndexedDB：只读快照缓存（items/meta）+ op 队列（ops）
 * - 移动端缓存不是权威副本，丢了可重拉
 * - 驳回/冲突的 op 留在本地作为草稿（不自动重投）
 * - device_id 首次生成后持久化
 */

const DB_NAME = "fold-local";
const DB_VERSION = 1;

export interface LocalItem {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  payload: string | null;
  version: number;
  origin_device: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type LocalOpStatus =
  | "queued" // 待投递
  | "synced" // 已提交（待审批）
  | "conflict" // 冲突，待笔记本端解决
  | "duplicate" // 服务端已存在（幂等命中）
  | "rejected"; // 被驳回 → 本地草稿，不自动重投

export interface LocalOp {
  op_id: string;
  device_id: string;
  type: "create" | "update" | "delete" | "tag" | "complete" | "expense_add";
  target_id: string | null;
  item_type: string | null;
  payload: Record<string, unknown>;
  base_version: number;
  client_seq: number | null;
  created_at: string;
  status: LocalOpStatus;
  server_note?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) {
        db.createObjectStore("items", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("ops")) {
        db.createObjectStore("ops", { keyPath: "op_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = fn(store);
        transaction.oncomplete = () => resolve(request ? (request.result as T) : undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

/* ---------- meta ---------- */

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T }>("meta", "readonly", (s) => s.get(key));
  return row?.value;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx("meta", "readwrite", (s) => s.put({ key, value }));
}

/** 设备 id：首次生成 UUID 并持久化 */
export async function getDeviceId(): Promise<string> {
  const existing = await getMeta<string>("device_id");
  if (existing) return existing;
  const id = `web-${crypto.randomUUID()}`;
  await setMeta("device_id", id);
  return id;
}

/** 客户端 op 序号（单调递增） */
export async function nextClientSeq(): Promise<number> {
  const cur = (await getMeta<number>("client_seq")) ?? 0;
  const next = cur + 1;
  await setMeta("client_seq", next);
  return next;
}

/* ---------- 快照缓存（只读副本，整体替换） ---------- */

export async function saveSnapshot(
  version: number,
  generatedAt: string,
  items: LocalItem[]
): Promise<void> {
  await tx("items", "readwrite", (s) => s.clear());
  for (const item of items) {
    await tx("items", "readwrite", (s) => s.put(item));
  }
  await setMeta("snapshot_version", version);
  await setMeta("snapshot_generated_at", generatedAt);
  await setMeta("last_sync_at", new Date().toISOString());
}

export async function listItems(): Promise<LocalItem[]> {
  const rows = await tx<LocalItem[]>("items", "readonly", (s) => s.getAll());
  return (rows ?? []).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

/* ---------- op 队列 ---------- */

export async function enqueueOp(op: LocalOp): Promise<void> {
  await tx("ops", "readwrite", (s) => s.put(op));
}

export async function listOps(): Promise<LocalOp[]> {
  const rows = await tx<LocalOp[]>("ops", "readonly", (s) => s.getAll());
  return (rows ?? []).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function updateOpStatus(
  opId: string,
  status: LocalOpStatus,
  serverNote?: string
): Promise<void> {
  const rows = await tx<LocalOp>("ops", "readonly", (s) => s.get(opId));
  if (!rows) return;
  rows.status = status;
  rows.server_note = serverNote;
  await tx("ops", "readwrite", (s) => s.put(rows));
}

/** 拉取快照后清理：已提交且对应条目已出现在快照中的 op，从队列移除 */
export async function pruneSyncedOps(items: LocalItem[]): Promise<void> {
  const ids = new Set(items.map((i) => i.id));
  const ops = await listOps();
  for (const op of ops) {
    if (op.status === "synced" && op.type === "create") {
      const itemId = (op.payload as { id?: string }).id;
      if (itemId && ids.has(itemId)) {
        await tx("ops", "readwrite", (s) => s.delete(op.op_id));
      }
    }
  }
}
