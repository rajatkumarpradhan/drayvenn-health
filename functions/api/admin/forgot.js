import { json, badRequest, hashPassword } from '../_lib.js';
import { randomToken, sha256hex, rateLimit, clientIp } from '../_auth.js';
import { sendPlainEmail } from '../_email.js';

/* Forgot password for clinic and doctor logins. Response is always the same generic
   message so it never reveals which emails are registered. Reset tokens are random,
   stored SHA-256 hashed, valid 30 minutes, single use.
   Demo mode: on a preview host, for @demo.drayvenn.in sample accounts only, when no email
   provider is configured, the reset link is returned on screen so the flow can be shown. */
const PROD_HOSTS = new Set(['drayvenn-health.pages.dev', 'drayvennlab.in', 'www.drayvennlab.in']);

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const email = ((body || {}).email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Enter a valid email');
  const rl = await rateLimit(DB, 'adm-forgot:' + clientIp(context.request), 5, 3600, 3600);
  if (rl.limited) return json({ error: `Too many requests. Try again in ${rl.retryAfterMin} minutes.` }, 429);

  const generic = { ok: true, message: 'If that email is registered, a reset link has been sent. It works for 30 minutes.' };
  let kind = 'clinic', subject = null;
  const c = await DB.prepare('SELECT clinic_id FROM clinic_admins WHERE email = ?').bind(email).first();
  if (c) subject = c.clinic_id;
  else {
    const d = await DB.prepare('SELECT doctor_id FROM doctor_admins WHERE email = ?').bind(email).first();
    if (d) { kind = 'doctor'; subject = d.doctor_id; }
  }
  if (!subject) return json(generic);

  const token = randomToken(32);
  await DB.prepare("DELETE FROM password_resets WHERE expires_at <= datetime('now')").run();
  await DB.prepare("DELETE FROM password_resets WHERE kind = ? AND subject_id = ?").bind(kind, subject).run();
  await DB.prepare("INSERT INTO password_resets (token_hash, kind, subject_id, expires_at) VALUES (?, ?, ?, datetime('now', '+30 minutes'))")
    .bind(await sha256hex(token), kind, subject).run();
  const origin = new URL(context.request.url).origin;
  const link = `${origin}/clinic-admin/login?reset=${token}`;

  const sent = await sendPlainEmail(context.env, email, 'Reset your Drayvenn Lab clinic password',
    `Use this link to set a new password (valid 30 minutes, one use):\n\n${link}\n\nIf you did not ask for this, ignore this email.\n\n- Drayvenn Lab`);
  if (sent.ok) return json(generic);

  const host = new URL(context.request.url).hostname;
  if (!PROD_HOSTS.has(host) && email.endsWith('@demo.drayvenn.in')) {
    return json({ ...generic, demo_link: link, demo_note: 'Demo mode: email is not connected yet, so the reset link is shown here for sample clinics only.' });
  }
  return json(generic);
}
