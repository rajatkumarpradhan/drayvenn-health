CREATE TABLE clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  tagline TEXT,
  specialties TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 4.5,
  reviews_count INTEGER NOT NULL DEFAULT 100,
  timings TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏥',
  admin_pin TEXT NOT NULL
);
CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  qualification TEXT NOT NULL,
  experience_years INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  days TEXT NOT NULL,
  sessions TEXT NOT NULL
);
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  clinic_id TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER,
  concern TEXT,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bookings_doctor_date ON bookings(doctor_id, date);
CREATE INDEX idx_bookings_clinic_date ON bookings(clinic_id, date);
CREATE INDEX idx_bookings_ref ON bookings(ref);
