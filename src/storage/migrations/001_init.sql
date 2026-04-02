CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_events_session_turn
ON session_events (session_id, turn_id);

CREATE TABLE IF NOT EXISTS memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(scope, key)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  pref_key TEXT NOT NULL,
  pref_value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, pref_key)
);

CREATE TABLE IF NOT EXISTS tool_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  UNIQUE(scope, permission_key)
);
