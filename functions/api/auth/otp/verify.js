import { json, badRequest } from '../../_lib.js';
import { hashOtp, safeEqualHex, rateLimit, clientIp, normalizePhone, createSession, sessionCookie, logAuthEvent } from '../../_auth.js';
import { notifyLogin } from '../../_alerts.js';

/* POST /api/auth/otp/verify { email|phone, code }
   Max 5 attempts per code then the identifier is blocked 15 min.
   Generic "invalid or expired" for every failure shape. */
const INVALID = () => json({ error: 'That code is invalid or has expired. Request a fresh one.' }, 401);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const code = String((body && body.code) || '').trim();

  let channel = null, identifier = null;
  if (body && body.email) {
    identifier = String(body.email).trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(identifier)) return badRequest('Enter a valid email address');
    channel = 'email';
  } else if (body && body.phone) {
    identifier = normalizePhone(body.phone);
    if (!/^[6-9]\d{9}$/.test(identifier)) return badRequest('Enter a valid 10-digit mobile number');
    channel = 'phone';
  } else {
    return badRequest('email is required');
  }
  if (!/^\d{6}$/.test(code)) return badRequest('Enter the 6-digit code');

  const ip = clientIp(context.request);
  const ipLimit = await rateLimit(DB, 'otpver:ip:' + ip, 10, 600, 900);
  if (ipLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + ipLimit.retryAfterMin + ' minutes.' }, 429);
  const blk = await DB.prepare('SELECT blocked_until FROM auth_rate WHERE key = ?').bind('otpblk:id:' + identifier).first();
  if (blk && blk.blocked_until && blk.blocked_until > new Date().toISOString()) {
    return json({ error: 'Too many attempts. Try again in about 15 minutes.' }, 429);
  }

  const otp = await DB.prepare(
    'SELECT * FROM otp_codes WHERE identifier = ? AND consumed = 0 ORDER BY id DESC LIMIT 1'
  ).bind(identifier).first();
  if (!otp || otp.expires_at < new Date().toISOString()) return INVALID();

  const attemptHash = await hashOtp(code, otp.salt);
  if (!safeEqualHex(attemptHash, otp.code_hash)) {
    const attempts = otp.attempts + 1;
    await DB.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').bind(attempts, otp.id).run();
    if (attempts >= 5) {
      await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').bind(otp.id).run();
      await rateLimit(DB, 'otpblk:id:' + identifier, 0, 1, 900);
      return json({ error: 'Too many wrong codes. Please wait about 15 minutes and try again.' }, 429);
    }
    return INVALID();
  }

  await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').bind(otp.id).run();

  // Find-or-create the patient. Email OTP links to a Google-created account
  // when the verified email matches its google_email (both proofs verify ownership).
  let patient;
  if (channel === 'email') {
    patient = await DB.prepare('SELECT * FROM patients WHERE email = ?').bind(identifier).first();
    if (!patient) {
      patient = await DB.prepare('SELECT * FROM patients WHERE google_email = ?').bind(identifier).first();
      if (patient) {
        await DB.prepare("UPDATE patients SET email = ?, updated_at = datetime('now') WHERE id = ?").bind(identifier, patient.id).run();
        patient.email = identifier;
      }
    }
    if (!patient) {
      const id = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await DB.prepare('INSERT INTO patients (id, email) VALUES (?, ?)').bind(id, identifier).run();
      patient = { id, email: identifier, phone: null, name: null, age: null, google_sub: null, google_email: null };
    }
  } else {
    patient = await DB.prepare('SELECT * FROM patients WHERE phone = ?').bind(identifier).first();
    if (!patient) {
      const id = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await DB.prepare('INSERT INTO patients (id, phone) VALUES (?, ?)').bind(id, identifier).run();
      patient = { id, phone: identifier, name: null, age: null, google_sub: null, google_email: null, email: null };
    }
    await DB.prepare('UPDATE bookings SET patient_id = ? WHERE phone = ? AND patient_id IS NULL').bind(patient.id, identifier).run();
  }

  const { token, maxAge } = await createSession(DB, patient.id, context.request);
  await logAuthEvent(DB, patient.id, 'login_otp_' + channel, { ip });
  await notifyLogin(context.env, patient, 'email', context.request);

  const res = json({ ok: true, patient: { name: patient.name, phone: patient.phone, email: patient.email || null, age: patient.age, has_google: !!patient.google_sub } });
  res.headers.append('Set-Cookie', sessionCookie(token, maxAge));
  return res;
}
