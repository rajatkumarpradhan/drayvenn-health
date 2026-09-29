/* Transactional email provider for OTP + login alerts. Pluggable: add providers here.
   First target: Brevo (free tier ~300 emails/day) sending as hello@drayvennlab.in.
   Provider state comes from Pages environment variables:
     BREVO_API_KEY   - Brevo SMTP & API > API Keys
     EMAIL_FROM      - e.g. "Drayvenn Health <hello@drayvennlab.in>"
                       (domain must be verified at the provider: SPF + DKIM records)
   When unset, both functions report not_configured and the API answers
   503 email_provider_not_configured - no bypass, no demo code. */

async function sendViaBrevo(env, toEmail, subject, text) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: parseSender(env.EMAIL_FROM || 'Drayvenn Health <hello@drayvennlab.in>'),
        to: [{ email: toEmail }],
        subject,
        textContent: text
      })
    });
    if (res.ok) return { ok: true, provider: 'brevo' };
    const data = await res.json().catch(() => ({}));
    return { ok: false, reason: 'provider_error', detail: String(data.message || res.status).slice(0, 120) };
  } catch (e) {
    return { ok: false, reason: 'provider_unreachable', detail: String(e).slice(0, 120) };
  }
}
function parseSender(from) {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1], email: m[2] } : { email: from };
}

export async function sendOtpEmail(env, email, code) {
  if (!env.BREVO_API_KEY) return { ok: false, reason: 'not_configured' };
  return sendViaBrevo(env, email,
    code + ' is your Drayvenn Health login code',
    'Your Drayvenn Health login code is ' + code + '. It expires in 10 minutes.\n\n' +
    'If you did not ask for this code, you can ignore this email - nobody can sign in without it.\n\n' +
    '- Drayvenn Health, by Drayvenn Lab');
}

export async function sendLoginAlertEmail(env, toEmail, method) {
  if (!env.BREVO_API_KEY || !toEmail) return { sent: false, reason: 'not_configured' };
  const r = await sendViaBrevo(env, toEmail,
    'New sign-in to your Drayvenn Health account',
    'Your Drayvenn Health account was just used to sign in via ' + (method === 'google' ? 'Google' : 'email code') + '.\n\n' +
    'If this was you, no action needed. If it was not you, reply to this email and we will secure your account.\n\n' +
    '- Drayvenn Health, by Drayvenn Lab');
  return { sent: r.ok, provider: r.ok ? 'brevo' : undefined, reason: r.ok ? undefined : r.reason };
}
