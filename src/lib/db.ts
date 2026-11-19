/**
 * SQLite 主库连接（阶段 0）
 * - 笔记本是唯一主库、唯一写入者（架构铁律 1）
 * - 首次访问时自动执行 db/schema.sql 建表（幂等）
 * - 铁律 8：data 目录绝不放进任何文件同步工具
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "./config";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, "fold.sqlite"));
  db.pragma("journal_mode = WAL");

  initSchema(db);
  return db;
}

/** 幂等建表：全部 CREATE TABLE IF NOT EXISTS */
function initSchema(database: Database.Database): void {
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  database.exec(sql);
}
