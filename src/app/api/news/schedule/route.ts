/**
 * /api/news/schedule - manual schedule check (test / troubleshooting).
 * Same runNewsSchedule() the cron tick calls; by-day idempotent, never backfills.
 */
import { requireAuth } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runNewsSchedule } from "@/lib/news";
import { getNewsConfig } from "@/lib/news-topics";

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "news-schedule"), 30, 60_000)) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }
  const cfg = getNewsConfig();
  const result = await runNewsSchedule();
  return Response.json({ result, schedule: getNewsConfig().schedule,
    before: cfg.schedule.last_run_date });
}
