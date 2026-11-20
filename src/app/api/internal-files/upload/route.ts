/**
 * /api/internal-files/upload —— 拖本地文件到网页 → 自动存进暂存区（三期 C3 第 2 轮）
 *
 * - 只支持单文件；写入 data/internal-vault/未分类/ 并复用 C3 registerFile 登记（全格式）
 * - 不写进加入的库、不自动分类、不自动移动、不自动批准
 * - 20MB 上限；同名冲突由 writeToUnsorted 自动加序号；疑似密钥文件名拒绝
 */
import path from "node:path";
import { requireAuth } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { writeToUnsorted, registerFile } from "@/lib/internal-vault";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const denied = requireAuth(req);
  if (denied) return denied;
  if (!rateLimit(clientKey(req, "internal-upload"), 30, 60_000)) {
    return Response.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return Response.json({ error: "请求体必须是 multipart/form-data" }, { status: 400 }); }
  const raw = form.get("file");
  if (!raw || typeof raw === "string") {
    return Response.json({ error: "没有收到文件（字段名 file）" }, { status: 400 });
  }
  const file = raw as File;
  const name = String(file.name ?? "").trim();
  if (!name) return Response.json({ error: "文件名为空" }, { status: 400 });
  if (typeof file.size === "number" && file.size > MAX_BYTES) {
    return Response.json({ error: "文件超过 20MB 上限" }, { status: 400 });
  }
  let buf: Buffer;
  try { buf = Buffer.from(await file.arrayBuffer()); }
  catch { return Response.json({ error: "读取文件失败" }, { status: 400 }); }
  if (buf.byteLength > MAX_BYTES) {
    return Response.json({ error: "文件超过 20MB 上限" }, { status: 400 });
  }
  try {
    const abs = writeToUnsorted(path.basename(name), buf);
    const rec = registerFile({
      absPath: abs,
      subtype: "other",
      title: path.basename(abs, path.extname(abs)),
      tags: [],
      source: `upload:${Date.now()}`,
    });
    return Response.json({ ok: true, file: rec }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "保存失败" }, { status: 400 });
  }
}
