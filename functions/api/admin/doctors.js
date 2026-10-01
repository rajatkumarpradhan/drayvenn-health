import { json, badRequest, requireAdmin, hashPassword, istToday } from '../_lib.js';
import { randomToken } from '../_auth.js';

/* Clinic-only doctor management: add, edit (fee, days, sessions), remove, create/replace a doctor login. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanDoctor(b) {
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const name = t(b.name, 80), specialty = t(b.specialty, 60), qualification = t(b.qualification, 100);
  const exp = parseInt(b.experience_years, 10), fee = parseInt(b.fee, 10);
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number))].filter(d => d >= 0 && d <= 6).sort() : [];
  const sessions = Array.isArray(b.sessions) ? b.sessions.map(x => ({ start: t(x && x.start, 5), end: t(x && x.end, 5) })) : [];
  if (name.length < 3) return { error: 'Enter the doctor name' };
  if (specialty.length < 2) return { error: 'Enter the specialty' };
  if (!(exp >= 0 && exp <= 70)) return { error: 'Experience must be 0 to 70 years' };
  if (!(fee >= 0 && fee <= 20000)) return { error: 'Fee must be between 0 and 20000' };
  if (!days.length) return { error: 'Pick at least one working day' };
  if (!sessions.length || sessions.length > 3) return { error: 'Add 1 to 3 time sessions' };
  for (const x of sessions) {
    if (!HHMM.test(x.start) || !HHMM.test(x.end) || x.start >= x.end) return { error: 'Each session needs a start time before its end time' };
  }
  return { v: { name, specialty, qualification, exp, fee, days, sessions } };
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  if (s.doctor_id) return json({ error: 'Only the clinic account can manage doctors' }, 403);
  let b; try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const action = b.action;

  if (action === 'save') {
    const c = cleanDoctor(b);
    if (c.error) return badRequest(c.error);
    const v = c.v;
    if (b.id) {
      const own = await DB.prepare('SELECT id FROM doctors WHERE id = ? AND clinic_id = ?').bind(b.id, s.clinic_id).first();
      if (!own) return json({ error: 'Doctor not found' }, 404);
      await DB.prepare('UPDATE doctors SET name=?, specialty=?, qualification=?, experience_years=?, fee=?, days=?, sessions=? WHERE id=?')
        .bind(v.name, v.specialty, v.qualification, v.exp, v.fee, JSON.stringify(v.days), JSON.stringify(v.sessions), b.id).run();
      await DB.prepare('UPDATE bookings SET doctor_name = ? WHERE doctor_id = ?').bind(v.name, b.id).run();
      return json({ ok: true, id: b.id });
    }
    const n = await DB.prepare('SELECT COUNT(*) AS n FROM doctors WHERE clinic_id = ?').bind(s.clinic_id).first();
    if (n.n >= 12) return badRequest('A clinic can list up to 12 doctors in the demo');
    const id = 'dr-' + randomToken(5);
    await DB.prepare('INSERT INTO doctors (id, clinic_id, name, specialty, qualification, experience_years, fee, days, sessions) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, s.clinic_id, v.name, v.specialty, v.qualification, v.exp, v.fee, JSON.stringify(v.days), JSON.stringify(v.sessions)).run();
    return json({ ok: true, id });
  }

  const own = await DB.prepare('SELECT id, name FROM doctors WHERE id = ? AND clinic_id = ?').bind(b.id, s.clinic_id).first();
  if (!own) return json({ error: 'Doctor not found' }, 404);

  if (action === 'delete') {
    const open = await DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE doctor_id = ? AND date >= ? AND status != 'cancelled'").bind(own.id, istToday()).first();
    if (open.n > 0) return json({ error: `${own.name} has ${open.n} upcoming booking(s). Cancel or move them first.` }, 409);
    const only = await DB.prepare('SELECT COUNT(*) AS n FROM doctors WHERE clinic_id = ?').bind(s.clinic_id).first();
    if (only.n <= 1) return json({ error: 'A clinic needs at least one doctor' }, 409);
    await DB.prepare('DELETE FROM doctor_admins WHERE doctor_id = ?').bind(own.id).run();
    await DB.prepare('DELETE FROM admin_sessions WHERE doctor_id = ?').bind(own.id).run();
    await DB.prepare('DELETE FROM doctors WHERE id = ?').bind(own.id).run();
    return json({ ok: true });
  }

  if (action === 'set_login') {
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Enter a valid doctor email');
    if (password.length < 10 || password.length > 100) return badRequest('Password must be 10 to 100 characters');
    const taken = await DB.prepare('SELECT 1 AS x FROM clinic_admins WHERE email = ? UNION SELECT 1 FROM doctor_admins WHERE email = ? AND doctor_id != ?').bind(email, email, own.id).first();
    if (taken) return json({ error: 'That email is already used for another login' }, 409);
    const salt = randomToken(16);
    const hash = await hashPassword(password, salt);
    await DB.prepare(`INSERT INTO doctor_admins (doctor_id, clinic_id, email, salt, password_hash) VALUES (?,?,?,?,?)
      ON CONFLICT(doctor_id) DO UPDATE SET email = excluded.email, salt = excluded.salt, password_hash = excluded.password_hash, fails = 0, locked_until = NULL`)
      .bind(own.id, s.clinic_id, email, salt, hash).run();
    await DB.prepare('DELETE FROM admin_sessions WHERE doctor_id = ?').bind(own.id).run();
    return json({ ok: true });
  }
  if (action === 'remove_login') {
    await DB.prepare('DELETE FROM doctor_admins WHERE doctor_id = ?').bind(own.id).run();
    await DB.prepare('DELETE FROM admin_sessions WHERE doctor_id = ?').bind(own.id).run();
    return json({ ok: true });
  }
  return badRequest('Unknown action');
}
