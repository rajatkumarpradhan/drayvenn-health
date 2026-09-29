import { json, badRequest } from '../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized, logAuthEvent } from '../_auth.js';

/* POST /api/auth/profile { name?, age? } - saved patient details used to prefill bookings. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const name = (body.name || '').toString().trim();
  const age = body.age === null || body.age === undefined || body.age === '' ? null : parseInt(body.age, 10);
  if (name && (name.length < 2 || name.length > 60)) return badRequest('Enter a valid name');
  if (age !== null && (isNaN(age) || age < 0 || age > 110)) return badRequest('Enter a valid age');
  await DB.prepare("UPDATE patients SET name = ?, age = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name || null, age, state.patient.id).run();
  await logAuthEvent(DB, state.patient.id, 'profile_update', null);
  const res = json({ ok: true, patient: { name: name || null, age } });
  return withSessionMaintenance(DB, state, context.request, res);
}
