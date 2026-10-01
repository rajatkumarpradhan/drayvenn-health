import { json, istToday, addDays, requireAdmin, purgeOldBookings } from '../_lib.js';

/* GET /api/admin/overview - dashboard numbers for the signed-in clinic (or doctor). */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  await purgeOldBookings(DB);
  const today = istToday();
  const from30 = addDays(today, -30), end7 = addDays(today, 6);
  const scope = s.doctor_id ? ' AND doctor_id = ?' : '';
  const base = [s.clinic_id].concat(s.doctor_id ? [s.doctor_id] : []);
  const q = (sql, extra) => DB.prepare(sql).bind(...base.concat(extra || []));

  const [todayRows, pendingAll, rate, week, recent, docs] = await Promise.all([
    q(`SELECT status, COUNT(*) n FROM bookings WHERE clinic_id = ?${scope} AND date = ? GROUP BY status`, [today]).all(),
    q(`SELECT COUNT(*) n FROM bookings WHERE clinic_id = ?${scope} AND status = 'pending' AND date >= ?`, [today]).first(),
    q(`SELECT status, COUNT(*) n FROM bookings WHERE clinic_id = ?${scope} AND date BETWEEN ? AND ? GROUP BY status`, [from30, today]).all(),
    q(`SELECT date, COUNT(*) n FROM bookings WHERE clinic_id = ?${scope} AND status != 'cancelled' AND date BETWEEN ? AND ? GROUP BY date`, [today, end7]).all(),
    q(`SELECT id, ref, patient_name, doctor_name, date, slot, concern FROM bookings WHERE clinic_id = ?${scope} AND status = 'pending' AND date >= ? ORDER BY created_at DESC LIMIT 5`, [today]).all(),
    DB.prepare('SELECT COUNT(*) total, SUM(active) active FROM doctors WHERE clinic_id = ?').bind(s.clinic_id).first()
  ]);
  const t = { total: 0, pending: 0, confirmed: 0, cancelled: 0 };
  for (const r of todayRows.results) { t[r.status] = (t[r.status] || 0) + r.n; t.total += r.n; }
  const r30 = { pending: 0, confirmed: 0, cancelled: 0 };
  for (const r of rate.results) r30[r.status] = (r30[r.status] || 0) + r.n;
  const decided = r30.confirmed + r30.cancelled + r30.pending;
  const wk = {}; for (const r of week.results) wk[r.date] = r.n;
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(today, i); days.push({ date: d, n: wk[d] || 0 }); }
  const upcoming7 = days.reduce((a, d) => a + d.n, 0);
  return json({
    today, role: s.doctor_id ? 'doctor' : 'clinic', clinic_name: s.clinic_name,
    today_counts: t, pending_total: pendingAll.n,
    confirmation_rate: decided ? Math.round((r30.confirmed / decided) * 100) : null, rate_basis: decided,
    upcoming7, days, recent_pending: recent.results,
    doctors: { total: docs.total, active: docs.active || 0 }
  });
}
