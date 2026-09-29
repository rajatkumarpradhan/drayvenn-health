/* SMS provider interface for OTP delivery. Pluggable: add providers here.
   First target: MSG91 (India, needs DLT-registered OTP template).
   Provider state comes from Pages environment variables:
     MSG91_AUTH_KEY     - MSG91 dashboard > API > Auth Key
     MSG91_TEMPLATE_ID  - DLT-registered OTP flow/template ID
     MSG91_SENDER_ID    - approved sender/header ID (6 chars, e.g. DRVYVN)
   When unset, sendOtpSms reports { ok: false, reason: 'not_configured' } and the
   API answers 503 otp_provider_not_configured - no bypass, no demo code. */

export async function sendOtpSms(env, phoneE164, code) {
  if (env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID) {
    return sendViaMsg91(env, phoneE164, code);
  }
  return { ok: false, reason: 'not_configured' };
}

async function sendViaMsg91(env, phoneE164, code) {
  // MSG91 OTP v5: https://control.msg91.com/api/v5/otp
  const mobile = phoneE164.replace(/^\+/, ''); // e.g. 919876543210
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('template_id', env.MSG91_TEMPLATE_ID);
  url.searchParams.set('mobile', mobile);
  url.searchParams.set('authkey', env.MSG91_AUTH_KEY);
  url.searchParams.set('otp', code);
  url.searchParams.set('otp_expiry', '10'); // minutes, enforced server-side too
  if (env.MSG91_SENDER_ID) url.searchParams.set('sender', env.MSG91_SENDER_ID);
  try {
    const res = await fetch(url.toString(), { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.type === 'success' || data.request_id)) return { ok: true, provider: 'msg91' };
    return { ok: false, reason: 'provider_error', detail: String(data.message || res.status).slice(0, 120) };
  } catch (e) {
    return { ok: false, reason: 'provider_unreachable', detail: String(e).slice(0, 120) };
  }
}

/* Login-alert hook: fires on every successful sign-in.
   Until an SMS/email provider is configured this is an audit-log-only no-op;
   wire MSG91 transactional SMS (or an email provider) here when the account exists. */
export async function sendLoginAlert(env, patient, method, request) {
  if (!(env.MSG91_AUTH_KEY && env.MSG91_ALERT_TEMPLATE_ID)) {
    return { sent: false, reason: 'not_configured' };
  }
  // Same pattern as sendViaMsg91 with the alert template; intentionally
  // fire-and-forget - an alert failure must never block a login.
  try {
    const url = new URL('https://control.msg91.com/api/v5/flow/');
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'authkey': env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: env.MSG91_ALERT_TEMPLATE_ID,
        sender: env.MSG91_SENDER_ID || undefined,
        mobiles: '91' + patient.phone,
        VAR1: method === 'google' ? 'Google' : 'mobile OTP'
      })
    });
    return { sent: res.ok, provider: 'msg91' };
  } catch {
    return { sent: false, reason: 'provider_unreachable' };
  }
}
