import { ownerJson, requireOwner, ownerCookie } from '../_owner.js';
export async function onRequestPost(context) {
  const { DB } = context.env;
  const s = await requireOwner(DB, context.request, { write: true });
  if (s) await DB.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(s.token_hash).run();
  const res = ownerJson({ ok: true });
  res.headers.append('Set-Cookie', ownerCookie('', 0));
  return res;
}
