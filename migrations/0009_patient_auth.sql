-- Step 3: patient accounts (phone OTP + Google sign-in)
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  google_sub TEXT UNIQUE,
  google_email TEXT,
  name TEXT,
  age INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  token_hash TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  rotated_from INTEGER,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_patient ON auth_sessions(patient_id);
CREATE TABLE IF NOT EXISTS auth_rate (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  blocked_until TEXT
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  link_patient_id TEXT,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT,
  event TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE bookings ADD COLUMN patient_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_patient ON bookings(patient_id);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
