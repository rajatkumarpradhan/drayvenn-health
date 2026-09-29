import { json, badRequest, normalizePhone, istToday } from '../_lib.js';

/* Failed-lookup guard: 8 failed ref+phone attempts per 10 min per IP -> 15 min block.
   Refs are short, so this is the brute-force bar for the demo. */
const GUARD_WINDOW_MS = 10 * 60 * 1000;
const GUARD_MAX_FAILS = 8;
const GUARD_BLOCK_MS = 15 * 60 * 1000;

function clientIp(context) {
  return context.request.headers.get('cf-connecting-ip') || 'unknown';
}
async function guardBlocked(DB, ip) {
  const row = await DB.prepare('SELECT blocked_until FROM lookup_guard WHERE ip = ?').bind(ip).first();
  if (row && row.blocked_until && row.blocked_until > new Date().toISOString()) return true;
  return false;
}
async function guardFail(DB, ip) {
  const now = new Date();
  const row = await DB.prepare('SELECT fails, window_start FROM lookup_guard WHERE ip = ?').bind(ip).first();
  let fails = 1, ws = now;
  if (row && (now - new Date(row.window_start)) < GUARD_WINDOW_MS) { fails = row.fails + 1; ws = new Date(row.window_start); }
  let blocked = null;
  if (fails >= GUARD_MAX_FAILS) { blocked = new Date(now.getTime() + GUARD_BLOCK_MS).toISOString(); fails = 0; ws = now; }
  await DB.prepare(
    `INSERT INTO lookup_guard (ip, fails, window_start, blocked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start, blocked_until = excluded.blocked_until`
  ).bind(ip, fails, ws.toISOString(), blocked).run();
  return blocked;
}
async function guardReset(DB, ip) {
  await DB.prepare('DELETE FROM lookup_guard WHERE ip = ?').bind(ip).run();
}
const tooMany = () => json({ error: 'Too many attempts. Please wait about 15 minutes and try again.' }, 429);


export async function onRequestGet(context) {
  const { DB } = context.env;
  const ip = clientIp(context);
  if (await guardBlocked(DB, ip)) return tooMany();
  const ref = (context.params.ref || '').toUpperCase();
  const url = new URL(context.request.url);
  const phone = normalizePhone(url.searchParams.get('phone'));
  if (!phone) return badRequest('phone is required');
  const b = await DB.prepare(
    `SELECT b.ref, b.status, b.date, b.slot, b.patient_name, b.age, b.doctor_name, b.clinic_name,
            c.area AS clinic_area, c.address AS clinic_address, c.phone AS clinic_phone, d.specialty, d.fee
     FROM bookings b JOIN clinics c ON c.id = b.clinic_id JOIN doctors d ON d.id = b.doctor_id
     WHERE b.ref = ? AND b.phone = ?`
  ).bind(ref, phone).first();
  if (!b) {
    if (await guardFail(DB, ip)) return tooMany();
    return json({ error: 'No booking found for that reference and mobile number' }, 404);
  }
  await guardReset(DB, ip);
  return json({ booking: b });
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  const ip = clientIp(context);
  if (await guardBlocked(DB, ip)) return tooMany();
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const phone = normalizePhone((body || {}).phone);
  if (!phone) return badRequest('phone is required');
  const b = await DB.prepare('SELECT id, status, date, phone FROM bookings WHERE ref = ?').bind(ref).first();
  if (!b || b.phone !== phone) {
    if (await guardFail(DB, ip)) return tooMany();
    return json({ error: 'No booking found for that reference and mobile number' }, 404);
  }
  if (b.status === 'cancelled') return badRequest('This booking is already cancelled');
  if (b.date < istToday()) return badRequest('Past bookings cannot be cancelled');
  await guardReset(DB, ip);
  await DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(b.id).run();
  return json({ ok: true, ref, status: 'cancelled' });
}
