import { json, badRequest } from '../../_lib.js';
import { randomToken, randomOtp, hashOtp, rateLimit, clientIp, normalizePhone } from '../../_auth.js';
import { sendOtpSms } from '../../_sms.js';

/* POST /api/auth/otp/request { phone }
   Always answers generically - never reveals whether a number has an account.
   Rate limits: 3 OTP requests / 10 min / number, 8 / 10 min / IP -> 15 min block. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const phone = normalizePhone(body && body.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) return badRequest('Enter a valid 10-digit mobile number');

  const ip = clientIp(context.request);
  const ipLimit = await rateLimit(DB, 'otpreq:ip:' + ip, 8, 600, 900);
  if (ipLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + ipLimit.retryAfterMin + ' minutes.' }, 429);
  const phoneLimit = await rateLimit(DB, 'otpreq:phone:' + phone, 3, 600, 900);
  if (phoneLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + phoneLimit.retryAfterMin + ' minutes.' }, 429);

  // Invalidate any earlier unconsumed codes for this number.
  await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE phone = ? AND consumed = 0').bind(phone).run();

  const code = randomOtp();
  const salt = randomToken(16);
  const codeHash = await hashOtp(code, salt);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await DB.prepare('INSERT INTO otp_codes (phone, code_hash, salt, expires_at) VALUES (?, ?, ?, ?)')
    .bind(phone, codeHash, salt, expires).run();

  const sent = await sendOtpSms(context.env, '+91' + phone, code);
  if (!sent.ok) {
    if (sent.reason === 'not_configured') {
      await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE phone = ?').bind(phone).run();
      return json({ ok: false, error: 'otp_provider_not_configured',
        message: 'SMS sign-in is being switched on. Please try Google sign-in or track with your booking reference for now.' }, 503);
    }
    await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE phone = ?').bind(phone).run();
    return json({ ok: false, error: 'otp_send_failed', message: 'Could not send the code right now - please try again in a minute.' }, 502);
  }
  return json({ ok: true, message: 'If this number can receive SMS, a login code is on its way. It expires in 10 minutes.' });
}
