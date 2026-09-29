-- Step 3b: email OTP (phone OTP deferred - DLT cost). otp_codes keys on a generic identifier.
ALTER TABLE otp_codes RENAME COLUMN phone TO identifier;
ALTER TABLE patients ADD COLUMN email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_email ON patients(email) WHERE email IS NOT NULL;
