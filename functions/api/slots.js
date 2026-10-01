import { json, badRequest, effectiveSlots, nowIST, istToday, addDays } from './_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const doctorId = url.searchParams.get('doctor_id');
  const date = url.searchParams.get('date');
  if (!doctorId || !date) return badRequest('doctor_id and date are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest('date must be YYYY-MM-DD');
  const today = istToday();
  if (date < today || date > addDays(today, 13)) return badRequest('date must be within the next 14 days');

  const doctor = await DB.prepare('SELECT * FROM doctors WHERE id = ?').bind(doctorId).first();
  if (!doctor) return json({ error: 'Doctor not found' }, 404);

  const all = await effectiveSlots(DB, doctor, date);
  const taken = await DB.prepare(
    "SELECT slot FROM bookings WHERE doctor_id = ? AND date = ? AND status != 'cancelled'"
  ).bind(doctorId, date).all();
  const takenSet = new Set(taken.results.map(r => r.slot));

  // Hide past times for today (IST).
  let cutoff = null;
  if (date === today) {
    const n = nowIST();
    cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
  }
  const slots = all.map(t => ({
    time: t,
    available: !takenSet.has(t) && (cutoff === null || t > cutoff)
  }));
  return json({ date, doctor_id: doctorId, slots });
}
