CREATE TABLE admin_sessions (
  token TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_expiry ON admin_sessions(expires_at);
