-- One active booking per doctor/date/slot: closes the race between two patients picking the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_active_slot ON bookings(doctor_id, date, slot) WHERE status != 'cancelled';
