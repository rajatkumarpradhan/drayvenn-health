import { json, badRequest } from '../../_lib.js';
import { randomToken, randomOtp, hashOtp, rateLimit, clientIp, normalizePhone } from '../../_auth.js';
import { sendOtpSms } from '../../_sms.js';
import { sendOtpEmail } from '../../_email.js';

/* POST /api/auth/otp/request { email } or { phone }
   Email OTP is the live method; phone OTP stays built but off until a SMS
   provider is configured (deferred: DLT registration cost; WhatsApp OTP is
   the pilot-stage upgrade). Generic responses, no account enumeration.
   Rate limits: 3 codes / 10 min / identifier, 8 / 10 min / IP -> 15 min block. */
const PREVIEW_TEST_PHONE = '9000000000';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
  const { DB } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }

  let channel = null, identifier = null, display = null;
  if (body && body.email) {
    identifier = String(body.email).trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(identifier)) return badRequest('Enter a valid email address');
    channel = 'email'; display = identifier;
  } else if (body && body.phone) {
    identifier = normalizePhone(body.phone);
    if (!/^[6-9]\d{9}$/.test(identifier)) return badRequest('Enter a valid 10-digit mobile number');
    channel = 'phone'; display = '+91' + identifier;
  } else {
    return badRequest('email is required');
  }

  const ip = clientIp(context.request);
  const ipLimit = await rateLimit(DB, 'otpreq:ip:' + ip, 8, 600, 900);
  if (ipLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + ipLimit.retryAfterMin + ' minutes.' }, 429);
  const idLimit = await rateLimit(DB, 'otpreq:id:' + identifier, 3, 600, 900);
  if (idLimit.limited) return json({ error: 'Too many attempts. Try again in about ' + idLimit.retryAfterMin + ' minutes.' }, 429);

  await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE identifier = ? AND consumed = 0').bind(identifier).run();

  const code = randomOtp();
  const salt = randomToken(16);
  const codeHash = await hashOtp(code, salt);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await DB.prepare('INSERT INTO otp_codes (identifier, code_hash, salt, expires_at) VALUES (?, ?, ?, ?)')
    .bind(identifier, codeHash, salt, expires).run();

  const sent = channel === 'email'
    ? await sendOtpEmail(context.env, identifier, code)
    : await sendOtpSms(context.env, display, code);

  if (!sent.ok) {
    /* Preview-only labelled test number (redesign branch ONLY, never production).
       SMS is not live (needs MSG91 + DLT), so ONE fixed test number gets its code
       handed back on screen. The code row is real and verify runs the real hash
       check - no bypass. Every other number gets the honest not-configured answer. */
    const isPreview = context.env.CF_PAGES_BRANCH === 'redesign';
    if (sent.reason === 'not_configured' && channel === 'phone' && isPreview && identifier === PREVIEW_TEST_PHONE) {
      return json({ ok: true, dev: true, devCode: code,
        message: 'Preview test number: the code is shown on screen because SMS is not live yet.' });
    }
    await DB.prepare('UPDATE otp_codes SET consumed = 1 WHERE identifier = ?').bind(identifier).run();
    const isPreview2 = context.env.CF_PAGES_BRANCH === 'redesign';
    if (sent.reason === 'not_configured') {
      return json({ ok: false, error: channel + '_provider_not_configured',
        message: channel === 'email'
          ? 'Email sign-in is being switched on. Please use Google sign-in or track with your booking reference for now.'
          : (isPreview2
              ? 'SMS codes are not live yet (needs the SMS provider). Preview testing: use the test number 90000 00000, or Google sign-in.'
              : 'SMS sign-in is being switched on. Please use Google sign-in or track with your booking reference for now.') }, 503);
    }
    return json({ ok: false, error: 'otp_send_failed', message: 'Could not send the code right now - please try again in a minute.' }, 502);
  }
  return json({ ok: true, message: channel === 'email'
    ? 'If this email can receive mail, a login code is on its way. It expires in 10 minutes.'
    : 'If this number can receive SMS, a login code is on its way. It expires in 10 minutes.' });
}
