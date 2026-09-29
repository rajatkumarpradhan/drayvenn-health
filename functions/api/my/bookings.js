import { json } from '../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized } from '../_auth.js';

/* GET /api/my/bookings - booking history for the signed-in patient.
   Includes bookings claimed by phone before the account existed. */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  const p = state.patient;
  const rows = p.phone
    ? await DB.prepare(
        `SELECT ref, clinic_id, doctor_id, clinic_name, clinic_area, doctor_name, specialty, fee, patient_name, age, concern, date, slot, status, created_at
         FROM bookings WHERE patient_id = ? OR phone = ? ORDER BY date DESC, slot DESC LIMIT 50`
      ).bind(p.id, p.phone).all()
    : await DB.prepare(
        `SELECT ref, clinic_id, doctor_id, clinic_name, clinic_area, doctor_name, specialty, fee, patient_name, age, concern, date, slot, status, created_at
         FROM bookings WHERE patient_id = ? ORDER BY date DESC, slot DESC LIMIT 50`
      ).bind(p.id).all();
  const res = json({ bookings: rows.results });
  return withSessionMaintenance(DB, state, context.request, res);
}
