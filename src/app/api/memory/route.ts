/**
 * /api/memory —— 记忆条目列表与新增（一期 A7）
 * GET  [?scope=profile|feature|fact][&tag=xxx][&tags=a,b] → { items[], mapping, defaults }
 * POST { scope, feature?, title, content, tags? } → { item }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createMemoryItem, DEFAULT_MAPPING, getMapping, listMemoryItems, filterByTags } from "@/lib/memory";

const createSchema = z.object({
  scope: z.enum(["profile", "feature", "fact"]),
  feature: z.string().max(64).optional(),
  title: z.string().trim().min(1, "请输入条目标题").max(200),
  content: z.string().trim().min(1, "请输入内容").max(8000),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).optional().default([]),
}).refine((v) => v.scope !== "feature" || Boolean(v.feature), {
  message: "功能记忆必须指定 feature", path: ["feature"],
});

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const scopeRaw = url.searchParams.get("scope");
  const scope = scopeRaw === "profile" || scopeRaw === "feature" || scopeRaw === "fact" ? scopeRaw : undefined;
  const tag = url.searchParams.get("tag") ?? undefined;
  const tagsRaw = url.searchParams.get("tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  let items = tags.length ? filterByTags(tags) : listMemoryItems(scope ? { scope } : undefined);
  if (tag) items = items.filter((i) => i.tags.includes(tag));
  return Response.json({ items, mapping: getMapping(), defaults: DEFAULT_MAPPING });
}

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "请求体必须是 JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "参数不合法" }, { status: 400 });
  }
  return Response.json({ item: createMemoryItem(parsed.data) }, { status: 201 });
}
