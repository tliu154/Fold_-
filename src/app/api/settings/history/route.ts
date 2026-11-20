/** /api/settings/history —— 设置改动历史（只读，复用 items(type=setting_history)） */
import { requireAuth } from "@/lib/auth";
import { listSettingHistory } from "@/lib/settings";

export function GET(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  return Response.json({ history: listSettingHistory(100) });
}
