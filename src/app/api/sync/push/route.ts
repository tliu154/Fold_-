/**
 * POST /api/sync/push —— 移动端投递操作请求（阶段 1 实装）
 * 契约：{device_id, ops[]} → 逐条 status + snapshot_version
 * - 幂等：op_id 重复 → duplicate
 * - base_version 过期（非 create 类）→ conflict，禁止自动合并
 * - 批准前主库不发生任何变化
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { pushOps, OP_TYPES, type IncomingOp, type OpPayload, type OpType } from "@/lib/sync";

const opSchema = z.object({
  op_id: z.string().uuid("op_id 必须是 UUID"),
  device_id: z.string().min(1).max(64),
  type: z.enum(OP_TYPES as [string, ...string[]]),
  target_id: z.string().nullable().default(null),
  item_type: z.string().min(1).max(32).nullable().default(null),
  payload: z.record(z.unknown()).default({}),
  base_version: z.number().int().min(0).default(0),
  client_seq: z.number().int().nullable().default(null),
  created_at: z.string().min(1),
});

const bodySchema = z.object({
  device_id: z.string().min(1, "缺少 device_id").max(64),
  ops: z.array(opSchema).min(1, "ops 不能为空").max(100, "单次最多 100 条 op"),
});

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;

  if (!rateLimit(clientKey(req, "sync-push"), 30, 60_000)) {
    return Response.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数不合法" },
      { status: 400 }
    );
  }

  const { results, snapshot_version } = pushOps(
    parsed.data.device_id,
    // 结构已由 zod 校验，收窄为引擎入参类型
    parsed.data.ops.map(
      (op): IncomingOp => ({
        ...op,
        type: op.type as OpType,
        payload: op.payload as OpPayload,
      })
    )
  );

  return Response.json({ results, snapshot_version });
}
