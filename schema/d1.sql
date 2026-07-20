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
  chat_id TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, source_id, target_id)
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

CREATE TABLE IF NOT EXISTS permission_grants (
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  permission TEXT NOT NULL,
  granted_by INTEGER,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id, permission)
);

CREATE TABLE IF NOT EXISTS topic_access (
  chat_id INTEGER NOT NULL,
  feature TEXT NOT NULL,
  thread_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, feature, thread_id)
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

CREATE INDEX IF NOT EXISTS idx_message_history_top_window
ON message_history (chat_id, created_at, thread_id);

CREATE TABLE IF NOT EXISTS topic_metadata (
  chat_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  current_name TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_event_message_id INTEGER,
  PRIMARY KEY (chat_id, thread_id)
);

CREATE TABLE IF NOT EXISTS topic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  old_name TEXT,
  new_name TEXT,
  message_id INTEGER,
  actor_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rose_sends (
  chat_id TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL,
  send_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_last_active (
  user_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  chat_id INTEGER NOT NULL DEFAULT 0,
  last_active_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_usage_count (
  chat_id INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (chat_id, user_id)
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

CREATE TABLE IF NOT EXISTS api_key_donations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  donor_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'invalid', 'disabled', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_validated_at TEXT,
  validation_error TEXT,
  UNIQUE(provider, key_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_api_key_donations_provider_status
ON api_key_donations (provider, status);

CREATE TABLE IF NOT EXISTS financial_donations (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL CHECK (method IN ('stars', 'ton')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_chain', 'paid', 'failed', 'cancelled')),
  donor_user_id TEXT NOT NULL,
  source_chat_id TEXT NOT NULL,
  amount TEXT,
  currency TEXT NOT NULL,
  memo TEXT,
  invoice_payload TEXT,
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_financial_donations_donor_created
ON financial_donations (donor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_financial_donations_method_status
ON financial_donations (method, status, created_at);

CREATE TABLE IF NOT EXISTS pull_request_snapshots (
  repository TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  head_sha TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  is_draft INTEGER NOT NULL DEFAULT 0,
  changed_files INTEGER NOT NULL DEFAULT 0,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_signals_json TEXT NOT NULL DEFAULT '[]',
  github_updated_at TEXT NOT NULL,
  last_seen_run_id TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repository, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pull_request_snapshots_state
ON pull_request_snapshots (repository, state, checked_at);

CREATE TABLE IF NOT EXISTS pr_monitor_runs (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  open_pr_count INTEGER,
  error_summary TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pr_monitor_runs_checked_at
ON pr_monitor_runs (repository, checked_at);

CREATE TABLE IF NOT EXISTS api_credential_profiles (
  donation_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  credential_type TEXT NOT NULL DEFAULT 'api_key',
  usage_policy TEXT NOT NULL DEFAULT 'validation_only'
    CHECK (usage_policy IN ('validation_only', 'shared_inference')),
  available_models_json TEXT NOT NULL DEFAULT '[]',
  health_status TEXT NOT NULL DEFAULT 'unchecked'
    CHECK (health_status IN ('unchecked', 'healthy', 'rate_limited', 'error', 'disabled', 'revoked')),
  last_checked_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_credential_profiles_routing
ON api_credential_profiles (provider, usage_policy, health_status, last_checked_at);

CREATE TABLE IF NOT EXISTS github_issue_submissions (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_url TEXT NOT NULL,
  issue_title TEXT NOT NULL,
  source_chat_id TEXT NOT NULL,
  source_user_id TEXT NOT NULL,
  body_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repository, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_github_issue_submissions_rate_limit
ON github_issue_submissions (repository, source_chat_id, source_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_github_issue_submissions_fingerprint
ON github_issue_submissions (repository, body_fingerprint, created_at);

CREATE TABLE IF NOT EXISTS github_issue_snapshots (
  repository TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  labels_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'not_ready')),
  eligible INTEGER NOT NULL DEFAULT 0,
  candidate_score INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'high')),
  eligibility_reasons_json TEXT NOT NULL DEFAULT '[]',
  github_created_at TEXT NOT NULL,
  github_updated_at TEXT NOT NULL,
  last_seen_run_id TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repository, issue_number)
);

CREATE INDEX IF NOT EXISTS idx_github_issue_snapshots_candidates
ON github_issue_snapshots (repository, state, eligible, candidate_score, checked_at);

CREATE TABLE IF NOT EXISTS evolution_selection_runs (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  pr_scan_status TEXT NOT NULL,
  suitable_pr_count INTEGER,
  ready_issue_count INTEGER,
  eligible_issue_count INTEGER,
  selected_issue_number INTEGER,
  selection_reason TEXT,
  error_summary TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_issue_triage_runs (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'skipped', 'error')),
  issue_number INTEGER,
  issue_updated_at TEXT,
  provider TEXT,
  model TEXT,
  credential_source TEXT,
  donation_id TEXT,
  paid_balance_verified INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  decision_reason TEXT NOT NULL,
  error_summary TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_issue_triage_runs_repository
ON ai_issue_triage_runs (repository, checked_at);
