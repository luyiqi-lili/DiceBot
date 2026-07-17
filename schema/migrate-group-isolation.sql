-- ============================================================================
-- 群组隔离迁移：为 affections / rose_sends / user_usage_count / user_last_active
-- 增加 chat_id 并改为按群组的复合主键。历史（未隔离）数据回填到 -1002970430696。
--
-- ⚠️ 不可逆。请在执行前对 D1 做备份（wrangler d1 export）。
-- 运行：wrangler d1 execute <db> --remote --file=schema/migrate-group-isolation.sql
-- ============================================================================

-- ---------- affections ----------
ALTER TABLE affections RENAME TO affections_old;
CREATE TABLE affections (
  chat_id TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, source_id, target_id)
);
INSERT INTO affections (chat_id, source_id, target_id, first_name, value, updated_at)
  SELECT '-1002970430696', source_id, target_id, first_name, value, updated_at FROM affections_old;
DROP TABLE affections_old;

-- ---------- rose_sends ----------
ALTER TABLE rose_sends RENAME TO rose_sends_old;
CREATE TABLE rose_sends (
  chat_id TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL,
  send_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id)
);
INSERT INTO rose_sends (chat_id, user_id, send_date, updated_at)
  SELECT '-1002970430696', user_id, send_date, updated_at FROM rose_sends_old;
DROP TABLE rose_sends_old;

-- ---------- user_usage_count ----------
ALTER TABLE user_usage_count RENAME TO user_usage_count_old;
CREATE TABLE user_usage_count (
  chat_id INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id)
);
INSERT INTO user_usage_count (chat_id, user_id, first_name, usage_count, updated_at)
  SELECT -1002970430696, user_id, first_name, usage_count, updated_at FROM user_usage_count_old;
DROP TABLE user_usage_count_old;

-- ---------- user_last_active ----------
-- 该表原本已有 chat_id 列：存在有效值则保留，否则回填 -1002970430696。
ALTER TABLE user_last_active RENAME TO user_last_active_old;
CREATE TABLE user_last_active (
  user_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  chat_id INTEGER NOT NULL DEFAULT 0,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, user_id)
);
INSERT OR IGNORE INTO user_last_active (user_id, username, first_name, last_name, chat_id, last_active_at, created_at)
  SELECT user_id, username, first_name, last_name,
         COALESCE(NULLIF(chat_id, 0), -1002970430696),
         last_active_at, created_at
  FROM user_last_active_old;
DROP TABLE user_last_active_old;
