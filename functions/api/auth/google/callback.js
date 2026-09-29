import { json } from '../../_lib.js';
import { createSession, sessionCookie, logAuthEvent } from '../../_auth.js';
import { sendLoginAlert } from '../../_sms.js';

/* GET /api/auth/google/callback?code&state
   Exchanges the code, verifies the id_token (aud + iss), then either links
   Google to the signed-in patient or finds/creates the patient by google_sub. */
function htmlError(msg) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Sign-in failed</title><body style="font-family:sans-serif;background:#0b1025;color:#eef;min-height:100vh;display:grid;place-items:center;margin:0"><div style="text-align:center;max-width:320px"><h2>Sign-in failed</h2><p>' + msg + '</p><p><a href="/" style="color:#5eead4">Back to Drayvenn Health</a></p></div></body>',
    { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet(context) {
  const { DB, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = context.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return htmlError('Google sign-in is not configured yet.');
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return htmlError('Missing sign-in parameters.');

  const stateRow = await DB.prepare('SELECT * FROM oauth_states WHERE state = ?').bind(state).first();
  await DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (!stateRow || stateRow.expires_at < new Date().toISOString()) return htmlError('That sign-in link expired - please try again.');

  const origin = url.origin;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: origin + '/api/auth/google/callback', grant_type: 'authorization_code'
    })
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokens.id_token) return htmlError('Google did not complete sign-in - please try again.');

  // Verify the id_token: audience, issuer, expiry (Google's tokeninfo endpoint).
  const info = await (await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tokens.id_token))).json().catch(() => ({}));
  if (info.aud !== GOOGLE_CLIENT_ID) return htmlError('Sign-in verification failed (audience).');
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return htmlError('Sign-in verification failed (issuer).');
  if (!info.sub) return htmlError('Sign-in verification failed.');

  const sub = String(info.sub);
  const email = info.email || null;
  const name = (info.name || '').toString().slice(0, 60) || null;

  // Link mode: attach Google to the already signed-in patient.
  if (stateRow.link_patient_id) {
    const existing = await DB.prepare('SELECT id FROM patients WHERE google_sub = ?').bind(sub).first();
    if (existing && existing.id !== stateRow.link_patient_id) return htmlError('That Google account is already linked to a different Drayvenn account.');
    await DB.prepare("UPDATE patients SET google_sub = ?, google_email = ?, name = COALESCE(name, ?), updated_at = datetime('now') WHERE id = ?")
      .bind(sub, email, name, stateRow.link_patient_id).run();
    await logAuthEvent(DB, stateRow.link_patient_id, 'link_google', { email });
    return Response.redirect(origin + '/?linked=google#account', 302);
  }

  let patient = await DB.prepare('SELECT * FROM patients WHERE google_sub = ?').bind(sub).first();
  if (!patient) {
    const id = 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await DB.prepare('INSERT INTO patients (id, google_sub, google_email, name) VALUES (?, ?, ?, ?)').bind(id, sub, email, name).run();
    patient = { id, phone: null, name, google_sub: sub, google_email: email, age: null };
  }
  const { token, maxAge } = await createSession(DB, patient.id, context.request);
  await logAuthEvent(DB, patient.id, 'login_google', { email });
  await sendLoginAlert(context.env, patient, 'google', context.request);

  const res = Response.redirect(origin + '/?login=google#account', 302);
  res.headers.append('Set-Cookie', sessionCookie(token, maxAge));
  return res;
}
