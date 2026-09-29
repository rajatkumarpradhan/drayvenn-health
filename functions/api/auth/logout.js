import { json } from '../_lib.js';
import { destroySession, clearSessionCookie, getPatientSession, logAuthEvent } from '../_auth.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (state) await logAuthEvent(DB, state.patient.id, 'logout', null);
  await destroySession(DB, context.request);
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearSessionCookie());
  return res;
}
