import { json, istToday, addDays, requireAdmin, purgeOldBookings } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const session = await requireAdmin(DB, context.request);
  if (!session) return json({ error: 'Session expired - sign in again' }, 401);
  await purgeOldBookings(DB);
  const today = istToday();
  const end = addDays(today, 6);
  const rows = await DB.prepare(
    `SELECT date, status, COUNT(*) AS n FROM bookings
     WHERE clinic_id = ? AND date BETWEEN ? AND ? GROUP BY date, status`
  ).bind(session.clinic_id, today, end).all();
  const days = {};
  for (const r of rows.results) {
    const d = (days[r.date] = days[r.date] || { total: 0, pending: 0, confirmed: 0, cancelled: 0 });
    d[r.status] = r.n;
    d.total += r.n;
  }
  return json({ today, days });
}
