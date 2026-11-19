-- ============================================================
-- Fold_归匣 主库建表 SQL（v0.6 骨架）
-- 幂等：全部 IF NOT EXISTS，首次启动时由 src/lib/db.ts 自动执行
-- 网站自建主库：待办/日程/打卡/笔记等都是网站自己的数据，不依赖 Obsidian
-- 铁律：SQLite 数据文件绝不放进任何 Git / 文件同步工具
-- 后续新增功能优先复用 items.payload；新增表必须先经用户批准
-- ============================================================

-- 统一条目表：待办 / 日程 / 打卡 / 笔记 / 对话存下来的内容都进这里，靠 type + payload 扩展
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,   -- todo|event|checkin|note|idea|diary|goal ...（可扩展，不写死枚举）
  title         TEXT,
  content       TEXT,            -- Markdown 正文（网站对自有数据不改正文）
  payload       TEXT,            -- JSON：due_at / tags / source / status / date ...
  version       INTEGER NOT NULL DEFAULT 1,
  origin_device TEXT,            -- 预留：四期安卓浏览器来源标记（一期不使用）
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT             -- 软删除墓碑
);

-- 三层记忆：基础身份(profile) / 功能记忆(feature:<name>) / 事实(fact) / 项目(project:<name>) / 临时(session)
CREATE TABLE IF NOT EXISTS memory (
  scope      TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,      -- JSON
  updated_at TEXT NOT NULL,
  expires_at TEXT,               -- 临时上下文过期时间
  PRIMARY KEY (scope, key)
);

-- AI 对话消息（一期：管家 + 普通对话；「记下来」由此落 items 并回填 saved_as_item_id）
CREATE TABLE IF NOT EXISTS ai_messages (
  id               TEXT PRIMARY KEY,
  session_id       TEXT,
  role             TEXT,         -- user|assistant|system
  content          TEXT,
  saved_as_item_id TEXT,         -- 仅由「记下来」按钮点击后回填（绝不自动）
  created_at       TEXT NOT NULL
);

-- AI 用量与成本（清单 10：ai_usage 记录每次调用，月度预算与限流）
CREATE TABLE IF NOT EXISTS ai_usage (
  id         TEXT PRIMARY KEY,
  model      TEXT,
  tokens_in  INTEGER,
  tokens_out INTEGER,
  cost_est   REAL,
  created_at TEXT NOT NULL
);
