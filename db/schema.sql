-- ============================================================
-- Fold_归匣 主库建表 SQL（阶段 0）
-- 幂等：全部 IF NOT EXISTS，首次启动时由 src/lib/db.ts 自动执行
-- 铁律：主库只存在笔记本上；SQLite 数据文件绝不放进任何文件同步工具
-- 后续新增功能优先复用 items.payload；新增表必须先经用户批准
-- ============================================================

CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,   -- note|idea|task|diary|expense|event|feed|goal（可扩展）
  title         TEXT,
  content       TEXT,            -- Markdown 正文
  payload       TEXT,            -- JSON：due_at / amount / tags / source / attachments / status ...
  version       INTEGER NOT NULL DEFAULT 1,
  origin_device TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT             -- 软删除墓碑，90 天后归档清理
);

CREATE TABLE IF NOT EXISTS pending_ops (
  op_id         TEXT PRIMARY KEY,   -- 幂等键
  device_id     TEXT NOT NULL,
  type          TEXT NOT NULL,      -- create|update|delete|tag|complete|expense_add
  target_id     TEXT,
  item_type     TEXT,
  payload       TEXT,              -- JSON
  base_version  INTEGER,           -- 移动端基于哪个主库版本做的修改
  client_seq    INTEGER,
  status        TEXT DEFAULT 'pending',  -- pending|approved|rejected|conflict|duplicate
  reject_reason TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applied_ops (
  op_id         TEXT PRIMARY KEY,
  applied_at    TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,     -- 应用前快照，回滚依据
  before_hash   TEXT,
  after_hash    TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  path        TEXT NOT NULL,
  reason      TEXT,               -- pre_apply|hourly|manual|weekly_backup
  description TEXT
);

CREATE TABLE IF NOT EXISTS memory (
  scope      TEXT NOT NULL,        -- profile|fact|project:<name>|session
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,        -- JSON
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT,
  role       TEXT,                 -- user|assistant|system
  content    TEXT,
  saved_as_item_id TEXT,           -- 仅由「存为笔记」按钮点击后回填
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id         TEXT PRIMARY KEY,
  model      TEXT, tokens_in INTEGER, tokens_out INTEGER,
  cost_est   REAL, created_at TEXT NOT NULL
);
