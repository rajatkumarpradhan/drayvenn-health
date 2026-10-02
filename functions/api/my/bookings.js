import { pubName, json } from '../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized } from '../_auth.js';

/* GET /api/my/bookings - booking history for the signed-in patient.
   Includes bookings claimed by phone before the account existed. */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  const p = state.patient;
  const cols = `SELECT b.ref, b.clinic_id, b.doctor_id, b.clinic_name, b.doctor_name, d.specialty, d.fee,
         b.patient_name, b.for_member_id, b.for_relation, b.age, b.gender, b.concern, b.date, b.slot, b.status, b.created_at,
         c.address AS clinic_address, c.phone AS clinic_phone, c.area AS clinic_area
         FROM bookings b LEFT JOIN doctors d ON d.id = b.doctor_id LEFT JOIN clinics c ON c.id = b.clinic_id`;
  const rows = p.phone
    ? await DB.prepare(cols + ` WHERE b.patient_id = ? OR b.phone = ? ORDER BY b.date DESC, b.slot DESC LIMIT 50`).bind(p.id, p.phone).all()
    : await DB.prepare(cols + ` WHERE b.patient_id = ? ORDER BY b.date DESC, b.slot DESC LIMIT 50`).bind(p.id).all();
  const res = json({ bookings: rows.results.map(r => ({ ...r, clinic_name: pubName(r.clinic_name) })) });
  return withSessionMaintenance(DB, state, context.request, res);
}
