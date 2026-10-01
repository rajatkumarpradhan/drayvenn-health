CREATE TABLE IF NOT EXISTS doctor_admins (
  doctor_id TEXT PRIMARY KEY REFERENCES doctors(id),
  clinic_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
ALTER TABLE admin_sessions ADD COLUMN doctor_id TEXT;
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clinic_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clinic_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT NOT NULL,
  specialties TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
