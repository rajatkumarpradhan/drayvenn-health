import { json, adminTokenFrom, sha256Hex, clearAdminCookie } from '../_lib.js';

/* Real sign-out: deletes the session row on the server (the token stops working everywhere) and clears the cookie. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  const t = adminTokenFrom(context.request);
  if (t) await DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(await sha256Hex(t.token)).run();
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearAdminCookie());
  return res;
}
