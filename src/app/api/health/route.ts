/**
 * GET /api/health —— 健康检查（阶段 0 实做）
 * 唯一免鉴权的接口
 */
import { getDb } from "@/lib/db";

export function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items'")
      .get();
    return Response.json({
      status: "ok",
      db: row ? "ready" : "missing-tables",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
