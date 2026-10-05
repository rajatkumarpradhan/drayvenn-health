import { sendBookingEmail } from '../../_email.js';
import { pubName, json, badRequest, requireAdmin, effectiveSlots, istToday, nowIST } from '../../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  const session = await requireAdmin(DB, context.request);
  if (!session) return json({ error: 'Session expired - sign in again' }, 401);
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const { action } = body || {};

  const id = parseInt(context.params.id, 10);
  const booking = await DB.prepare('SELECT id, ref, clinic_name, doctor_name, patient_id, status, doctor_id, date, slot FROM bookings WHERE id = ? AND clinic_id = ?').bind(id, session.clinic_id).first();
  if (booking && session.doctor_id && booking.doctor_id !== session.doctor_id) return json({ error: 'Booking not found' }, 404);
  if (!booking) return json({ error: 'Booking not found' }, 404);

  if (action === 'reschedule') {
    const { date, slot } = body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(slot || ''))
      return badRequest('date (YYYY-MM-DD) and slot (HH:MM) are required');
    if (booking.status === 'cancelled') return badRequest('Cancelled bookings cannot be rescheduled');
    const today = istToday();
    if (date < today) return badRequest('Cannot move a booking to a past date');
    const doctor = await DB.prepare('SELECT * FROM doctors WHERE id = ?').bind(booking.doctor_id).first();
    if (!doctor) return json({ error: 'Doctor not found' }, 404);
    if (!(await effectiveSlots(DB, doctor, date)).includes(slot))
      return badRequest('That is not a valid slot for this doctor on that date');
    if (date === today) {
      const n = nowIST();
      const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
      if (slot <= cutoff) return badRequest('That time has already passed today');
    }
    const clash = await DB.prepare(
      "SELECT id FROM bookings WHERE doctor_id = ? AND date = ? AND slot = ? AND status != 'cancelled' AND id != ?"
    ).bind(booking.doctor_id, date, slot, id).first();
    if (clash) return json({ error: 'That slot is already taken' }, 409);
    await DB.prepare('UPDATE bookings SET date = ?, slot = ? WHERE id = ?').bind(date, slot, id).run();
    await notify(context, booking, 'rescheduled', date, slot);
    return json({ ok: true, id, date, slot });
  }

  let status;
  if (action === 'confirm') status = 'confirmed';
  else if (action === 'cancel') status = 'cancelled';
  else return badRequest('action must be confirm, cancel or reschedule');

  await DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
  if (status !== booking.status) await notify(context, booking, status, booking.date, booking.slot);
  return json({ ok: true, id, status });
}

async function notify(context, bk, kind, date, slot) {
  try {
    if (!bk.patient_id) return;
    const p = await context.env.DB.prepare('SELECT email, google_email FROM patients WHERE id = ?').bind(bk.patient_id).first();
    const to = p && (p.email || p.google_email);
    if (!to) return;
    const job = sendBookingEmail(context.env, to, kind, { ref: bk.ref, clinic: pubName(bk.clinic_name), doctor: bk.doctor_name, date, slot }).catch(() => {});
    if (context.waitUntil) context.waitUntil(job);
  } catch (e) {}
}
