import { json, badRequest, generateSlots, nowIST, istToday, addDays, makeRef, normalizePhone, purgeOldBookings } from './_lib.js';
import { getPatientSession } from './_auth.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  await purgeOldBookings(DB);
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }

  const { clinic_id, doctor_id, patient_name, phone, date, slot } = body || {};
  // Optional auth: a signed-in patient's bookings attach to their account.
  const authState = await getPatientSession(DB, context.request);
  const patientId = authState ? authState.patient.id : null;
  if (body.consent !== true) return badRequest('Consent to the privacy policy is required to book');
  const age = body.age ? parseInt(body.age, 10) : null;
  const concern = (body.concern || '').toString().slice(0, 300).trim();

  if (!clinic_id || !doctor_id) return badRequest('clinic_id and doctor_id are required');
  const name = (patient_name || '').toString().trim();
  if (name.length < 2 || name.length > 60) return badRequest('Please enter the patient name');
  const ph = normalizePhone(phone);
  if (!/^[6-9]\d{9}$/.test(ph)) return badRequest('Enter a valid 10-digit mobile number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return badRequest('date must be YYYY-MM-DD');
  const today = istToday();
  if (date < today || date > addDays(today, 13)) return badRequest('Pick a date within the next 14 days');
  if (!/^\d{2}:\d{2}$/.test(slot || '')) return badRequest('Pick a time slot');
  if (age !== null && (isNaN(age) || age < 0 || age > 110)) return badRequest('Enter a valid age');

  const clinic = await DB.prepare('SELECT * FROM clinics WHERE id = ?').bind(clinic_id).first();
  if (!clinic) return json({ error: 'Clinic not found' }, 404);
  const doctor = await DB.prepare('SELECT * FROM doctors WHERE id = ? AND clinic_id = ?').bind(doctor_id, clinic_id).first();
  if (!doctor) return json({ error: 'Doctor not found' }, 404);

  if (!generateSlots(doctor, date).includes(slot)) return badRequest('That slot is not available for this doctor');
  if (date === today) {
    const n = nowIST();
    const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
    if (slot <= cutoff) return badRequest('That time has already passed today - pick a later slot');
  }
  const clash = await DB.prepare(
    "SELECT id FROM bookings WHERE doctor_id = ? AND date = ? AND slot = ? AND status != 'cancelled'"
  ).bind(doctor_id, date, slot).first();
  if (clash) return badRequest('That slot was just taken - please pick another');

  let ref = makeRef();
  for (let i = 0; i < 5; i++) {
    const exists = await DB.prepare('SELECT id FROM bookings WHERE ref = ?').bind(ref).first();
    if (!exists) break;
    ref = makeRef();
  }

  await DB.prepare(
    `INSERT INTO bookings (ref, clinic_id, clinic_name, doctor_id, doctor_name, patient_name, phone, age, concern, date, slot, status, consent_at, patient_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)`
  ).bind(ref, clinic_id, clinic.name, doctor_id, doctor.name, name, ph, age, concern || null, date, slot, patientId).run();

  return json({
    booking: {
      ref, status: 'pending',
      clinic_name: clinic.name, clinic_area: clinic.area, clinic_address: clinic.address, clinic_phone: clinic.phone,
      doctor_name: doctor.name, specialty: doctor.specialty, fee: doctor.fee,
      patient_name: name, phone: ph, age, date, slot
    }
  }, 201);
}

export async function onRequestGet() {
  // Removed for privacy: phone-only listing exposed every booking on a number.
  // Single-booking lookup now lives at /api/bookings/[ref]?phone= and requires both.
  return json({ error: 'Phone-only lookup was removed. Use your booking reference with your mobile number.' }, 410);
}
