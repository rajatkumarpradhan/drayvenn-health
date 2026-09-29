import { json, istToday, requireAdmin } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const date = url.searchParams.get('date') || istToday();
  const session = await requireAdmin(DB, context.request);
  if (!session) return json({ error: 'Session expired - sign in again' }, 401);

  const rows = await DB.prepare(
    `SELECT id, ref, patient_name, phone, age, concern, date, slot, status, doctor_name, created_at,
            (SELECT COUNT(*) FROM bookings p WHERE p.clinic_id = bookings.clinic_id AND p.phone = bookings.phone
             AND p.status != 'cancelled' AND (p.date < bookings.date OR (p.date = bookings.date AND p.id < bookings.id))) AS prior_visits
     FROM bookings WHERE clinic_id = ? AND date = ? ORDER BY slot`
  ).bind(session.clinic_id, date).all();

  const counts = { total: 0, pending: 0, confirmed: 0, cancelled: 0 };
  for (const r of rows.results) { counts.total++; counts[r.status] = (counts[r.status] || 0) + 1; }
  return json({ clinic: { id: session.clinic_id, name: session.clinic_name }, date, counts, bookings: rows.results });
}
