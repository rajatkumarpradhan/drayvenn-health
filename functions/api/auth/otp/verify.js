import { json, badRequest } from '../../_lib.js';
import { hashOtp, safeEqualHex, rateLimit, clientIp, normalizePhone, createSession, sessionCookie, logAuthEvent } from '../../_auth.js';
import { sendLoginAlert } from '../../_sms.js';

/* POST /api/auth/otp/verify { phone, code }
   Max 5 attempts per code then the number is blocked 15 min.
   Generic "invalid or expired" for every failure shape. */
const INVALID = () => json({ error: 'That code is invalid or has expired. Request a fresh one.' }, 401);

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const phone = normalizePhone(body && body.phone);
  const code = String((body && body.code) || '').trim();
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return badRequest('Enter the 6-digit code from the SMS');

  const ip = clientIp(context.request);
  const ipLimit = await rateLimit(DB, 'otpver:ip:' + ip, 10, 600, 900);
  if (ipLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + ipLimit.retryAfterMin + ' minutes.' }, 429);
  const blk = await rateLimit(DB, 'otpblk:phone:' + phone, 999999, 1, 1); // read-only block check
  if (blk.limited) return json({ error: 'Too many attempts. Try again in about ' + blk.retryAfterMin + ' minutes.' }, 429);

  const otp = await DB.prepare(
    "SELECT * FROM otp_codes WHERE phone = ? AND consumed = 0 ORDER BY id DESC LIMIT 1"
  ).bind(phone).first();
  if (!otp || otp.expires_at < new Date().toISOString()) return INVALID();

  const attemptHash = await hashOtp(code, otp.salt);
  if (!safeEqualHex(attemptHash, otp.code_hash)) {
    const attempts = otp.attempts + 1;
    await DB.prepare('UPDATE otp_codes SET attempts = ? WHERE id = ?').bind(attempts, otp.id).run();
    if (attempts >= 5) {
      await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').bind(otp.id).run();
      await rateLimit(DB, 'otpblk:phone:' + phone, 0, 1, 900); // 15-min block
      return json({ error: 'Too many wrong codes. This number is paused for about 15 minutes.' }, 429);
    }
    return INVALID();
  }

  await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').bind(otp.id).run();

  // Find-or-create the patient. Generic flow: OTP sign-in doubles as registration.
  let patient = await DB.prepare('SELECT * FROM patients WHERE phone = ?').bind(phone).first();
  if (!patient) {
    const id = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await DB.prepare('INSERT INTO patients (id, phone) VALUES (?, ?)').bind(id, phone).run();
    patient = { id, phone, name: null, age: null, google_sub: null, google_email: null };
  }
  // Claim any bookings made with this number before the account existed.
  await DB.prepare('UPDATE bookings SET patient_id = ? WHERE phone = ? AND patient_id IS NULL').bind(patient.id, phone).run();

  const { token, maxAge } = await createSession(DB, patient.id, context.request);
  await logAuthEvent(DB, patient.id, 'login_otp', { ip });
  await sendLoginAlert(context.env, patient, 'otp', context.request);

  const res = json({ ok: true, patient: { name: patient.name, phone: patient.phone, age: patient.age, has_google: !!patient.google_sub } });
  res.headers.append('Set-Cookie', sessionCookie(token, maxAge));
  return res;
}
