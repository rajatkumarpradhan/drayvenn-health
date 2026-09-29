import { json, badRequest, hashPassword, safeEqualHex } from '../_lib.js';

/* Clinic sign-in: per-clinic email + password (PBKDF2-SHA256, 100k).
   5 failed attempts locks the account for 15 minutes. Sessions last 12 hours. */
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const email = ((body || {}).email || '').trim().toLowerCase();
  const password = ((body || {}).password || '');
  if (!email || !password) return badRequest('Enter your clinic email and password');

  const account = await DB.prepare(
    `SELECT a.clinic_id, a.salt, a.password_hash, a.fails, a.locked_until, c.name
     FROM clinic_admins a JOIN clinics c ON c.id = a.clinic_id WHERE a.email = ?`
  ).bind(email).first();
  if (!account) return json({ error: 'Wrong email or password' }, 401);

  if (account.locked_until && account.locked_until > new Date().toISOString()) {
    return json({ error: `Too many failed attempts. This account is locked until about ${account.locked_until.slice(11, 16)} UTC. Try again later.` }, 429);
  }

  const hash = await hashPassword(password, account.salt);
  if (!safeEqualHex(hash, account.password_hash)) {
    const fails = account.fails + 1;
    const locked = fails >= MAX_FAILS
      ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString().replace('T', ' ').slice(0, 19)
      : null;
    await DB.prepare('UPDATE clinic_admins SET fails = ?, locked_until = ? WHERE clinic_id = ?')
      .bind(locked ? 0 : fails, locked, account.clinic_id).run();
    if (locked) return json({ error: `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.` }, 429);
    return json({ error: 'Wrong email or password' }, 401);
  }

  await DB.prepare('UPDATE clinic_admins SET fails = 0, locked_until = NULL WHERE clinic_id = ?').bind(account.clinic_id).run();
  await DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= datetime('now')").run();
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const token = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
  await DB.prepare(
    "INSERT INTO admin_sessions (token, clinic_id, expires_at) VALUES (?, ?, datetime('now', '+12 hours'))"
  ).bind(token, account.clinic_id).run();
  return json({ token, clinic: { id: account.clinic_id, name: account.name } });
}
