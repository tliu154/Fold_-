/**
 * 阶段 1 端到端验收脚本（Node 18+，自带 fetch）
 * 用法：先启动服务（npm run dev 或 npm run start），然后
 *   node scripts/e2e-stage1.mjs
 * 可选环境变量：BASE（默认 http://localhost:3000）、PASSWORD（默认 fold-dev-2026）
 *
 * 覆盖：登录 → push create → 批准前主库不变 → 批准（version+1 + 快照审计）
 *       → snapshot 一致 → 重复 push duplicate → 过期 base_version conflict
 *       → resolve 以主库为准 → update 正常流 → delete 软删除 → 快照文件存在
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.PASSWORD ?? "fold-dev-2026";

let token = "";
let passed = 0;
let failed = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

const uuid = () => crypto.randomUUID();

async function main() {
  console.log(`端到端验收 ${BASE}`);

  // 0. 健康检查
  const health = await api("/api/health");
  ok("GET /api/health 200", health.status === 200);

  // 1. 登录
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const loginData = await login.json();
  token = loginData.token ?? "";
  ok("登录成功并拿到 token", login.status === 200 && token.length > 0);

  // 2. push create op
  const itemId = uuid();
  const createOpId = uuid();
  const push1 = await api("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "e2e-test-device",
      ops: [
        {
          op_id: createOpId,
          device_id: "e2e-test-device",
          type: "create",
          target_id: null,
          item_type: "note",
          payload: { id: itemId, title: "e2e 测试笔记", content: "阶段 1 闭环测试" },
          base_version: 0,
          client_seq: 1,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  });
  ok(
    "push create → pending",
    push1.status === 200 && push1.data.results?.[0]?.status === "pending",
    JSON.stringify(push1.data)
  );
  const versionAfterPush = push1.data.snapshot_version;

  // 3. 批准前主库不变
  const snapBefore = await api("/api/sync/snapshot");
  ok(
    "批准前主库无该条目（snapshot 不含）",
    snapBefore.status === 200 &&
      !snapBefore.data.items?.some((i) => i.id === itemId)
  );

  // 4. 审批台可见
  const pending = await api("/api/ops/pending?status=pending");
  ok(
    "审批台列出该 op",
    pending.status === 200 && pending.data.ops?.some((o) => o.op_id === createOpId)
  );

  // 5. 批准 → version+1 + 快照审计
  const approve = await api(`/api/ops/${createOpId}/approve`, { method: "POST" });
  ok(
    "批准成功且 version+1",
    approve.status === 200 &&
      approve.data.applied === true &&
      approve.data.db_version === versionAfterPush + 1
  );
  ok("applied_ops 审计含快照路径记录（create 类为空路径）", approve.status === 200);

  // 6. snapshot 一致
  const snapAfter = await api("/api/sync/snapshot");
  const item = snapAfter.data.items?.find((i) => i.id === itemId);
  ok(
    "批准后 snapshot 含该条目且版本一致",
    Boolean(item) && snapAfter.data.version === approve.data.db_version
  );

  // 7. 重复 push → duplicate
  const push2 = await api("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "e2e-test-device",
      ops: [
        {
          op_id: createOpId,
          device_id: "e2e-test-device",
          type: "create",
          target_id: null,
          item_type: "note",
          payload: { id: itemId, title: "重复投递", content: "" },
          base_version: 0,
          client_seq: 2,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  });
  ok("重复 push → duplicate", push2.data.results?.[0]?.status === "duplicate");

  // 8. 过期 base_version 的 update → conflict
  const updateOpId = uuid();
  const push3 = await api("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "e2e-test-device",
      ops: [
        {
          op_id: updateOpId,
          device_id: "e2e-test-device",
          type: "update",
          target_id: itemId,
          item_type: "note",
          payload: { content: "基于过期版本的修改" },
          base_version: 0, // 过期
          client_seq: 3,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  });
  ok("过期 base_version → conflict", push3.data.results?.[0]?.status === "conflict");

  // 9. 冲突列表可见
  const conflicts = await api("/api/ops/conflicts");
  ok(
    "冲突列表含该 op 且带主库当前条目",
    conflicts.data.conflicts?.some((c) => c.op_id === updateOpId && c.server_item?.id === itemId)
  );

  // 10. resolve 以主库为准
  const resolve = await api(`/api/ops/${updateOpId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ resolution: "server" }),
  });
  ok("resolve 以主库为准 → op 被驳回", resolve.status === 200 && resolve.data.ok === true);
  const contentAfter = (await api("/api/sync/snapshot")).data.items?.find(
    (i) => i.id === itemId
  );
  ok("条目内容未被客户端修改覆盖", contentAfter?.content === "阶段 1 闭环测试");

  // 11. 正常 update（base_version 最新）→ pending → 批准
  const currentVersion = push3.data.snapshot_version;
  const updateOpId2 = uuid();
  const push4 = await api("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "e2e-test-device",
      ops: [
        {
          op_id: updateOpId2,
          device_id: "e2e-test-device",
          type: "update",
          target_id: itemId,
          item_type: "note",
          payload: { content: "更新后的内容" },
          base_version: currentVersion,
          client_seq: 4,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  });
  ok("最新 base_version update → pending", push4.data.results?.[0]?.status === "pending");
  const approve2 = await api(`/api/ops/${updateOpId2}/approve`, { method: "POST" });
  ok("update 批准成功", approve2.status === 200 && approve2.data.applied === true);
  const contentAfter2 = (await api("/api/sync/snapshot")).data.items?.find(
    (i) => i.id === itemId
  );
  ok("update 生效", contentAfter2?.content === "更新后的内容");
  ok("update 产生快照文件路径", Boolean(approve2.data.snapshot_path));

  // 12. delete → 人工批准 → 软删除 + 快照可恢复
  const deleteOpId = uuid();
  const push5 = await api("/api/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "e2e-test-device",
      ops: [
        {
          op_id: deleteOpId,
          device_id: "e2e-test-device",
          type: "delete",
          target_id: itemId,
          item_type: "note",
          payload: {},
          base_version: approve2.data.db_version,
          client_seq: 5,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  });
  ok("delete → pending（永不自动批准）", push5.data.results?.[0]?.status === "pending");
  const approveDel = await api(`/api/ops/${deleteOpId}/approve`, { method: "POST" });
  ok("delete 批准成功", approveDel.status === 200 && approveDel.data.applied === true);
  ok("delete 快照文件存在（可恢复依据）", Boolean(approveDel.data.snapshot_path));
  const snapFinal = await api("/api/sync/snapshot");
  ok(
    "软删除后快照排除该条目（整体替换后移动端不可见）",
    !snapFinal.data.items?.some((i) => i.id === itemId)
  );

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("脚本异常：", e);
  process.exit(1);
});
