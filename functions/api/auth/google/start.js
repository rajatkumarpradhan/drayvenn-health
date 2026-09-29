import { json } from '../../_lib.js';
import { randomToken, getPatientSession } from '../../_auth.js';

/* GET /api/auth/google/start
   Redirects to Google's OAuth consent. If the visitor already has a patient
   session, the callback links Google to that account. Clean 503 when the
   OAuth client is not configured yet. */
export async function onRequestGet(context) {
  const { DB, GOOGLE_CLIENT_ID } = context.env;
  if (!GOOGLE_CLIENT_ID || !context.env.GOOGLE_CLIENT_SECRET) {
    return json({ ok: false, error: 'google_not_configured',
      message: 'Google sign-in is being switched on. Please use an email code or track with your booking reference for now.' }, 503);
  }
  const state = randomToken(16);
  const session = await getPatientSession(DB, context.request);
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await DB.prepare('INSERT INTO oauth_states (state, link_patient_id, expires_at) VALUES (?, ?, ?)')
    .bind(state, session ? session.patient.id : null, expires).run();
  // Housekeeping: drop stale states.
  await DB.prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run();

  const origin = new URL(context.request.url).origin;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: origin + '/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(), 302);
}
