import { json, badRequest, normalizePhone } from '../_lib.js';

/* DPDP self-service: a patient asks for their booking data to be deleted.
   Request flow for now - logged in D1, actioned manually, confirmed to the patient. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const phone = normalizePhone((body || {}).phone);
  const ref = ((body || {}).ref || '').trim().toUpperCase().slice(0, 20) || null;
  const note = ((body || {}).note || '').trim().slice(0, 300) || null;
  if (!/^[6-9]\d{9}$/.test(phone)) return badRequest('Enter the valid 10-digit mobile number used for booking');
  await DB.prepare(
    'INSERT INTO delete_requests (phone, ref, note) VALUES (?, ?, ?)'
  ).bind(phone, ref, note).run();
  return json({ ok: true, message: 'Request received. We will delete your booking data and confirm within 7 days.' });
}
