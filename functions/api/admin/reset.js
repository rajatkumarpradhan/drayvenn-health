import { json, badRequest, hashPassword } from '../_lib.js';
import { randomToken, sha256hex, rateLimit, clientIp } from '../_auth.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const token = ((body || {}).token || '').trim();
  const password = (body || {}).password || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return badRequest('This reset link is not valid');
  if (password.length < 10 || password.length > 100) return badRequest('Password must be 10 to 100 characters');
  const rl = await rateLimit(DB, 'adm-reset:' + clientIp(context.request), 10, 3600, 3600);
  if (rl.limited) return json({ error: `Too many attempts. Try again in ${rl.retryAfterMin} minutes.` }, 429);

  const row = await DB.prepare("SELECT kind, subject_id FROM password_resets WHERE token_hash = ? AND expires_at > datetime('now')")
    .bind(await sha256hex(token)).first();
  if (!row) return json({ error: 'This reset link has expired or was already used. Ask for a new one.' }, 400);

  const salt = randomToken(16);
  const hash = await hashPassword(password, salt);
  if (row.kind === 'doctor') {
    await DB.prepare('UPDATE doctor_admins SET salt = ?, password_hash = ?, fails = 0, locked_until = NULL WHERE doctor_id = ?').bind(salt, hash, row.subject_id).run();
    await DB.prepare('DELETE FROM admin_sessions WHERE doctor_id = ?').bind(row.subject_id).run();
  } else {
    await DB.prepare('UPDATE clinic_admins SET salt = ?, password_hash = ?, fails = 0, locked_until = NULL WHERE clinic_id = ?').bind(salt, hash, row.subject_id).run();
    await DB.prepare('DELETE FROM admin_sessions WHERE clinic_id = ? AND doctor_id IS NULL').bind(row.subject_id).run();
  }
  await DB.prepare('DELETE FROM password_resets WHERE token_hash = ?').bind(await sha256hex(token)).run();
  return json({ ok: true });
}
