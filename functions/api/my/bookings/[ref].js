import { json, badRequest, generateSlots, istToday, nowIST } from '../../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized } from '../../_auth.js';

/* POST /api/my/bookings/[ref] { action: 'cancel' | 'reschedule', date?, slot? }
   Patient self-service. Ownership: booking belongs to this patient (patient_id,
   or phone match - claimed on first touch). Reschedule mirrors the clinic-side
   validation rules exactly. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const { action } = body || {};
  const ref = (context.params.ref || '').toUpperCase();
  const p = state.patient;

  const booking = await DB.prepare('SELECT * FROM bookings WHERE ref = ?').bind(ref).first();
  if (!booking) return json({ error: 'Booking not found' }, 404);
  const owns = booking.patient_id === p.id || (p.phone && booking.phone === p.phone);
  if (!owns) return json({ error: 'Booking not found' }, 404); // generic: no existence leak
  if (!booking.patient_id) {
    await DB.prepare('UPDATE bookings SET patient_id = ? WHERE id = ?').bind(p.id, booking.id).run();
  }

  if (action === 'cancel') {
    if (booking.status === 'cancelled') return badRequest('That booking is already cancelled');
    if (booking.date < istToday()) return badRequest('Past appointments cannot be cancelled');
    await DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(booking.id).run();
    const res = json({ ok: true, ref, status: 'cancelled' });
    return withSessionMaintenance(DB, state, context.request, res);
  }

  if (action === 'reschedule') {
    const { date, slot } = body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(slot || ''))
      return badRequest('date (YYYY-MM-DD) and slot (HH:MM) are required');
    if (booking.status === 'cancelled') return badRequest('Cancelled bookings cannot be rescheduled');
    const today = istToday();
    if (date < today) return badRequest('Cannot move a booking to a past date');
    if (booking.date < today) return badRequest('Past appointments cannot be rescheduled');
    const doctor = await DB.prepare('SELECT * FROM doctors WHERE id = ?').bind(booking.doctor_id).first();
    if (!doctor) return json({ error: 'Doctor not found' }, 404);
    if (!generateSlots(doctor, date).includes(slot))
      return badRequest('That is not a valid slot for this doctor on that date');
    if (date === today) {
      const n = nowIST();
      const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
      if (slot <= cutoff) return badRequest('That time has already passed today');
    }
    const clash = await DB.prepare(
      "SELECT id FROM bookings WHERE doctor_id = ? AND date = ? AND slot = ? AND status != 'cancelled' AND id != ?"
    ).bind(booking.doctor_id, date, slot, booking.id).first();
    if (clash) return json({ error: 'That slot is already taken' }, 409);
    await DB.prepare('UPDATE bookings SET date = ?, slot = ? WHERE id = ?').bind(date, slot, booking.id).run();
    const res = json({ ok: true, ref, date, slot });
    return withSessionMaintenance(DB, state, context.request, res);
  }

  return badRequest("action must be cancel or reschedule");
}
