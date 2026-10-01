import { json, badRequest, requireAdmin, generateSlots, istToday, addDays, nowIST } from '../_lib.js';

/* Clinic slot management on top of each doctor's weekly schedule.
   GET  ?doctor_id=  -> next 14 days, every slot with state: open | blocked | booked (+ extra flag)
   POST {doctor_id, date, slot, action: 'block' | 'unblock' | 'add'}
     block   - disable a slot (not allowed while it has a booking)
     unblock - re-enable a disabled slot, or remove an added extra slot
     add     - add an extra slot on that date (HH:MM) */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

async function ownDoctor(DB, s, id) {
  const d = await DB.prepare('SELECT * FROM doctors WHERE id = ? AND clinic_id = ?').bind(id, s.clinic_id).first();
  if (!d) return null;
  if (s.doctor_id && s.doctor_id !== d.id) return null;
  return d;
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  const doc = await ownDoctor(DB, s, new URL(context.request.url).searchParams.get('doctor_id') || '');
  if (!doc) return json({ error: 'Doctor not found' }, 404);
  const today = istToday(), end = addDays(today, 13);
  const bk = await DB.prepare(
    "SELECT date, slot, ref, patient_name, status FROM bookings WHERE doctor_id = ? AND date BETWEEN ? AND ? AND status != 'cancelled'"
  ).bind(doc.id, today, end).all();
  const ov = await DB.prepare('SELECT date, slot, kind FROM slot_overrides WHERE doctor_id = ? AND date BETWEEN ? AND ?').bind(doc.id, today, end).all();
  const booked = {}; for (const b of bk.results) booked[b.date + '|' + b.slot] = b;
  const blocked = new Set(), extra = new Set();
  for (const o of ov.results) (o.kind === 'block' ? blocked : extra).add(o.date + '|' + o.slot);
  const n = nowIST();
  const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
  const days = [];
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i);
    const set = new Set(generateSlots(doc, date));
    for (const k of extra) if (k.startsWith(date + '|')) set.add(k.slice(11));
    for (const k of blocked) if (k.startsWith(date + '|')) set.add(k.slice(11));
    for (const k of Object.keys(booked)) if (k.startsWith(date + '|')) set.add(k.slice(11));
    const slots = [...set].sort().map(t => {
      const key = date + '|' + t, b = booked[key];
      return {
        time: t,
        state: b ? 'booked' : blocked.has(key) ? 'blocked' : 'open',
        extra: extra.has(key), past: i === 0 && t <= cutoff,
        ref: b ? b.ref : undefined, patient: b ? b.patient_name : undefined, status: b ? b.status : undefined
      };
    });
    days.push({ date, works: generateSlots(doc, date).length > 0, slots });
  }
  return json({ doctor: { id: doc.id, name: doc.name, specialty: doc.specialty, active: doc.active }, today, days });
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  let b; try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const doc = await ownDoctor(DB, s, b.doctor_id || '');
  if (!doc) return json({ error: 'Doctor not found' }, 404);
  const { date, slot, action } = b;
  const today = istToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < today || date > addDays(today, 13)) return badRequest('Pick a date within the next 14 days');
  if (!HHMM.test(slot || '')) return badRequest('Pick a valid time');
  if (date === today) {
    const n = nowIST();
    const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
    if (slot <= cutoff) return badRequest('That time has already passed today');
  }
  const base = generateSlots(doc, date).includes(slot);
  const cur = await DB.prepare('SELECT kind FROM slot_overrides WHERE doctor_id = ? AND date = ? AND slot = ?').bind(doc.id, date, slot).first();
  const taken = await DB.prepare("SELECT ref FROM bookings WHERE doctor_id = ? AND date = ? AND slot = ? AND status != 'cancelled'").bind(doc.id, date, slot).first();

  if (action === 'block') {
    if (taken) return json({ error: 'This slot has a booking (' + taken.ref + '). Cancel or move it first.' }, 409);
    if (cur && cur.kind === 'extra') await DB.prepare('DELETE FROM slot_overrides WHERE doctor_id = ? AND date = ? AND slot = ?').bind(doc.id, date, slot).run();
    else if (base) await DB.prepare("INSERT OR REPLACE INTO slot_overrides (doctor_id, date, slot, kind) VALUES (?,?,?,'block')").bind(doc.id, date, slot).run();
    else return badRequest('That slot is not on the schedule');
    return json({ ok: true });
  }
  if (action === 'unblock') {
    await DB.prepare('DELETE FROM slot_overrides WHERE doctor_id = ? AND date = ? AND slot = ?').bind(doc.id, date, slot).run();
    return json({ ok: true });
  }
  if (action === 'add') {
    if (base && !(cur && cur.kind === 'block')) return badRequest('That slot already exists');
    if (cur && cur.kind === 'block') { await DB.prepare('DELETE FROM slot_overrides WHERE doctor_id = ? AND date = ? AND slot = ?').bind(doc.id, date, slot).run(); return json({ ok: true }); }
    if (cur && cur.kind === 'extra') return badRequest('That slot already exists');
    await DB.prepare("INSERT INTO slot_overrides (doctor_id, date, slot, kind) VALUES (?,?,?,'extra')").bind(doc.id, date, slot).run();
    return json({ ok: true });
  }
  return badRequest('action must be block, unblock or add');
}
