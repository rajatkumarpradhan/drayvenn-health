import { json, istToday, addDays, requireAdmin } from '../_lib.js';

/* GET /api/admin/appointments?scope=pending|today|upcoming|past&all=1
   scope=pending: every pending booking from today onward. today/upcoming/past: confirmed only
   unless all=1 (then every status). Scoped to the signed-in clinic (and doctor, for doctor logins). */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  const url = new URL(context.request.url);
  const scope = url.searchParams.get('scope') || 'pending';
  const all = url.searchParams.get('all') === '1';
  const today = istToday();
  let where = 'b.clinic_id = ?', args = [s.clinic_id];
  if (s.doctor_id) { where += ' AND b.doctor_id = ?'; args.push(s.doctor_id); }
  let order = 'b.date, b.slot', limit = 200;
  if (scope === 'pending') { where += " AND b.status = 'pending' AND b.date >= ?"; args.push(today); }
  else {
    if (scope === 'today') { where += ' AND b.date = ?'; args.push(today); }
    else if (scope === 'upcoming') { where += ' AND b.date > ?'; args.push(today); }
    else if (scope === 'past') { where += ' AND b.date < ?'; args.push(today); order = 'b.date DESC, b.slot DESC'; limit = 100; }
    else return json({ error: 'scope must be pending, today, upcoming or past' }, 400);
    if (!all) where += " AND b.status = 'confirmed'";
  }
  const rows = await DB.prepare(
    `SELECT b.id, b.ref, b.patient_name, b.phone, b.age, b.gender, b.concern, b.date, b.slot, b.status, b.doctor_id, b.doctor_name, b.created_at, d.specialty
     FROM bookings b LEFT JOIN doctors d ON d.id = b.doctor_id WHERE ${where} ORDER BY ${order} LIMIT ${limit}`
  ).bind(...args).all();
  return json({ today, scope, bookings: rows.results });
}
