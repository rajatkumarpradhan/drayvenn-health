import { json, badRequest, hashPassword } from '../_lib.js';
import { randomToken } from '../_auth.js';

/* Drayvenn Lab team only: review clinic join requests. Platform sessions are stored with
   the sentinel clinic id '__platform__', so they can never reach clinic data endpoints. */
async function requirePlatform(DB, request) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return DB.prepare("SELECT token FROM admin_sessions WHERE token = ? AND clinic_id = '__platform__' AND expires_at > datetime('now')").bind(token).first();
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!(await requirePlatform(DB, context.request))) return json({ error: 'Session expired - sign in again' }, 401);
  const rows = await DB.prepare('SELECT id, clinic_name, contact_name, email, phone, area, specialties, message, status, clinic_id, created_at FROM clinic_requests ORDER BY (status = \'new\') DESC, id DESC LIMIT 100').all();
  return json({ requests: rows.results });
}

function slugify(n) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clinic';
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!(await requirePlatform(DB, context.request))) return json({ error: 'Session expired - sign in again' }, 401);
  let b; try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const r = await DB.prepare('SELECT * FROM clinic_requests WHERE id = ?').bind(parseInt(b.id, 10)).first();
  if (!r) return json({ error: 'Request not found' }, 404);

  if (b.action === 'reject' || b.action === 'test') {
    if (r.status !== 'new') return json({ error: 'This request was already reviewed' }, 409);
    await DB.prepare("UPDATE clinic_requests SET status = ?, reviewed_at = datetime('now') WHERE id = ?").bind(b.action === 'test' ? 'test' : 'rejected', r.id).run();
    return json({ ok: true });
  }
  if (b.action !== 'approve') return badRequest('Unknown action');
  if (r.status !== 'new') return json({ error: 'This request was already reviewed' }, 409);

  const loginEmail = String(b.login_email || r.email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail)) return badRequest('Enter a valid login email');
  const taken = await DB.prepare('SELECT 1 AS x FROM clinic_admins WHERE email = ? UNION SELECT 1 FROM doctor_admins WHERE email = ? UNION SELECT 1 FROM platform_admins WHERE email = ?').bind(loginEmail, loginEmail, loginEmail).first();
  if (taken) return json({ error: 'That login email is already in use' }, 409);

  const sample = b.sample !== false;
  const name = (sample ? 'SAMPLE - ' : '') + r.clinic_name.replace(/^SAMPLE\s*-\s*/i, '');
  let id = slugify(r.clinic_name), n = 0;
  while (await DB.prepare('SELECT 1 AS x FROM clinics WHERE id = ?').bind(id).first()) id = slugify(r.clinic_name) + '-' + (++n + 1);
  const specs = (r.specialties || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 8);
  const tempPassword = randomToken(6) + 'A9';   // 14 chars, shown once to the team member
  const salt = randomToken(16);
  const hash = await hashPassword(tempPassword, salt);
  await DB.batch([
    DB.prepare('INSERT INTO clinics (id, name, area, address, phone, tagline, specialties, timings, rating, reviews_count, admin_pin) VALUES (?,?,?,?,?,?,?,?,0,0,?)')
      .bind(id, name, r.area, 'Address to be added by the clinic', r.phone.replace(/[^\d+ ]/g, ''), '', JSON.stringify(specs.length ? specs : ['General Medicine']), 'Timings to be added by the clinic', 'unused'),
    DB.prepare('INSERT INTO clinic_admins (clinic_id, email, salt, password_hash) VALUES (?,?,?,?)').bind(id, loginEmail, salt, hash),
    DB.prepare("UPDATE clinic_requests SET status = 'approved', reviewed_at = datetime('now'), clinic_id = ? WHERE id = ?").bind(id, r.id)
  ]);
  return json({ ok: true, clinic_id: id, clinic_name: name, login_email: loginEmail, temp_password: tempPassword });
}
