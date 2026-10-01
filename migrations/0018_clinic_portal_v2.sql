-- Clinic portal v2: doctor enable/disable, per-date slot overrides, clinic logo.
ALTER TABLE doctors ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clinics ADD COLUMN logo TEXT;
CREATE TABLE IF NOT EXISTS slot_overrides (
  doctor_id TEXT NOT NULL,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('block','extra')),
  PRIMARY KEY (doctor_id, date, slot)
);
