CREATE TABLE IF NOT EXISTS act_pending (
  chat_id INTEGER NOT NULL,
  thread_id INTEGER,
  start_message_id INTEGER,
  start_time TEXT,
  PRIMARY KEY (chat_id, thread_id)
);

CREATE TABLE IF NOT EXISTS act_sessions (
  id TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  thread_id INTEGER,
  topic_name TEXT,
  start_message_id INTEGER,
  start_time TEXT,
  end_message_id INTEGER,
  end_time TEXT,
  content TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS affections (
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (source_id, target_id)
);

CREATE TABLE IF NOT EXISTS dnd_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  char_name TEXT NOT NULL,
  race TEXT NOT NULL,
  class TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  hp_max INTEGER NOT NULL DEFAULT 10,
  hp_current INTEGER NOT NULL DEFAULT 10,
  attributes TEXT NOT NULL,
  proficiencies TEXT DEFAULT '[]',
  equipment TEXT DEFAULT '[]',
  rest_short_used INTEGER NOT NULL DEFAULT 0,
  rest_long_used INTEGER NOT NULL DEFAULT 0,
  rest_date TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  mana_max INTEGER DEFAULT 0,
  mana_current INTEGER DEFAULT 0,
  mana_date TEXT DEFAULT '',
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS dnd_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  primary_attr TEXT NOT NULL,
  hit_die INTEGER NOT NULL DEFAULT 6,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, class_name)
);

CREATE TABLE IF NOT EXISTS dnd_dc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  dc_value INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  set_by TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id)
);

CREATE TABLE IF NOT EXISTS dnd_gm (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  set_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS dnd_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES dnd_item_templates(id)
);

CREATE TABLE IF NOT EXISTS dnd_item_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  slot TEXT DEFAULT '',
  attr_bonus TEXT NOT NULL DEFAULT '{}',
  uses INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  damage TEXT DEFAULT '',
  UNIQUE(chat_id, name)
);

CREATE TABLE IF NOT EXISTS dnd_races (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  race_name TEXT NOT NULL,
  attr_bonuses TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, race_name)
);

CREATE TABLE IF NOT EXISTS dnd_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  linked_attr TEXT NOT NULL,
  class_name TEXT NOT NULL,
  race_bonus TEXT NOT NULL DEFAULT '{}',
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  damage TEXT DEFAULT '',
  mana_cost INTEGER DEFAULT 0,
  spell_level INTEGER DEFAULT 1,
  UNIQUE(chat_id, skill_name)
);

CREATE TABLE IF NOT EXISTS group_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_value TEXT,
  display_name TEXT,
  is_base_attribute BOOLEAN DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, rule_type, rule_name)
);

CREATE TABLE IF NOT EXISTS long_term_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  thread_id TEXT DEFAULT NULL,
  memory_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, thread_id)
);

CREATE TABLE IF NOT EXISTS message_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  chat_id INTEGER,
  thread_id INTEGER,
  topic_name TEXT,
  message_id INTEGER,
  text_content TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS rose_sends (
  user_id INTEGER PRIMARY KEY,
  send_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_last_active (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  chat_id INTEGER,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_usage_count (
  user_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL DEFAULT '',
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wish_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  thread_id TEXT,
  body TEXT NOT NULL,
  items_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wish_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id INTEGER NOT NULL,
  item_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  wish_ids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'summarized',
  approved_by TEXT,
  approved_at TEXT,
  result_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  thread_id TEXT,
  user_id TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  summary_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
