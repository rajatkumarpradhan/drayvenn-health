-- Owner (super admin): separate account, sessions and audit log. No default credentials:
-- the account only exists after a one-time setup link (owner_setup) is used.
CREATE TABLE IF NOT EXISTS owner_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS owner_setup (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS owner_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  detail TEXT
);
