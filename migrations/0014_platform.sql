CREATE TABLE IF NOT EXISTS platform_admins (
  email TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
ALTER TABLE clinic_requests ADD COLUMN reviewed_at TEXT;
ALTER TABLE clinic_requests ADD COLUMN clinic_id TEXT;
