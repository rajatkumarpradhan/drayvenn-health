import { json } from '../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized } from '../_auth.js';

/* GET /api/auth/me - current patient + sliding session rotation. */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  const res = json({ patient: { name: state.patient.name, phone: state.patient.phone, age: state.patient.age, has_google: !!state.patient.google_sub, google_email: state.patient.google_email, email: state.patient.email } });
  return withSessionMaintenance(DB, state, context.request, res);
}
