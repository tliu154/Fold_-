/**
 * News topic draft (C3 round 3).
 * POST { text } -> structured draft; NOT persisted, no message, no file write.
 * Model failures are reported honestly, never mocked.
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { callStructured } from "@/lib/chat";
import { getNewsConfig, validateNewsConfig, NEWS_LIMITS } from "@/lib/news-topics";

const schema = z.object({ text: z.string().trim().min(1).max(500) });

interface RawDraft { topics?: unknown; }

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "news-draft"), 10, 60_000)) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "body must be JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const cur = getNewsConfig();
  const sys = [
    "You are a website settings butler. Convert the user request into ONE JSON object only.",
    "The object has a topics array. Each item has: name, query, enabled (boolean).",
    `Rules: at most ${NEWS_LIMITS.maxTopics} items; name <= ${NEWS_LIMITS.maxName} chars; query <= ${NEWS_LIMITS.maxQuery} chars.` ,
    "enabled must be true or false. Do NOT output id or created_at. No markdown, no other text.",
    "If the user asks to delete a topic, return only the remaining topics.",
    "Write name and query values in Chinese.",
  ].join(" ");
  const user = [
    "Current topics:",
    JSON.stringify(cur.topics.map((t) => ({ name: t.name, query: t.query, enabled: t.enabled }))),
    "User request:",
    parsed.data.text,
  ].join("\n");

  let raw: RawDraft;
  try {
    raw = await callStructured<RawDraft>([
      { role: "system", content: sys },
      { role: "user", content: user },
    ]);
  } catch (e) {
    return Response.json({ ok: false, status: "ai_failed",
      error: `model call failed: ${(e as Error).message}`.slice(0, 300), draft: null });
  }
  if (!raw || !Array.isArray(raw.topics)) {
    return Response.json({ ok: false, status: "ai_bad_output",
      error: "model did not return a topics array", draft: null });
  }

  const proposed = raw.topics.map((t, i) => {
    const x = (t ?? {}) as Record<string, unknown>;
    const name = typeof x.name === "string" ? x.name.trim() : "";
    const old = cur.topics.find((o) => o.name === name) ?? cur.topics[i];
    return {
      id: old?.id ?? `topic-${Date.now()}-${i}`,
      name,
      query: typeof x.query === "string" ? x.query.trim() : "",
      enabled: x.enabled === true,
      created_at: old?.created_at ?? new Date().toISOString(),
    };
  });
  const v = validateNewsConfig({ topics: proposed });
  return Response.json({
    ok: v.ok,
    status: v.ok ? "ok" : "ai_bad_output",
    draft: { topics: proposed, schedule: cur.schedule },
    current: { topics: cur.topics, schedule: cur.schedule },
    valid: v.ok,
    errors: v.errors,
    note: "draft is in memory only; PUT /api/news/topics to persist",
  });
}
