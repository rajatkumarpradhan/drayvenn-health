import { ownerJson, sameOrigin, checkPassword, startSession, ownerCookie, audit, rateLimit, clientIp, hashPassword, sha256Hex, randomToken } from '../_owner.js';

/* One-time owner setup. Needs a single-use token (only its hash is stored, 24h expiry) that is
   created out-of-band by the developer. Works only while no owner account exists. */
export async function onRequestPost(context) {
  const DB = context.env.DB, request = context.request;
  if (!sameOrigin(request)) return ownerJson({ error: 'Request blocked' }, 403);
  const rl = await rateLimit(DB, 'owner-setup:' + clientIp(request), 6, 3600, 3600);
  if (rl.limited) return ownerJson({ error: 'Too many attempts. Try again later.' }, 429);
  let b; try { b = await request.json(); } catch { return ownerJson({ error: 'Invalid request' }, 400); }
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const token = String(b.token || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ownerJson({ error: 'Enter a valid email' }, 400);
  const bad = checkPassword(b.password);
  if (bad) return ownerJson({ error: bad }, 400);
  if (!/^[0-9a-f]{48}$/.test(token)) return ownerJson({ error: 'This setup link is not valid or has expired' }, 403);
  const existing = await DB.prepare('SELECT 1 AS x FROM owner_account WHERE id = 1').first();
  if (existing) return ownerJson({ error: 'This setup link is not valid or has expired' }, 403);
  const th = await sha256Hex(token);
  const row = await DB.prepare("SELECT token_hash FROM owner_setup WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')").bind(th).first();
  if (!row) return ownerJson({ error: 'This setup link is not valid or has expired' }, 403);
  const salt = randomToken(16), hash = await hashPassword(String(b.password), salt);
  // Claim the token first (atomic): only one request can flip used_at.
  const claim = await DB.prepare("UPDATE owner_setup SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL").bind(th).run();
  if (!claim.meta || claim.meta.changes !== 1) return ownerJson({ error: 'This setup link is not valid or has expired' }, 403);
  await DB.prepare('INSERT INTO owner_account (id, email, salt, password_hash) VALUES (1, ?, ?, ?)').bind(email, salt, hash).run();
  await audit(DB, 'owner_setup', email);
  const s = await startSession(DB);
  const res = ownerJson({ ok: true, email, csrf: s.csrf });
  res.headers.append('Set-Cookie', ownerCookie(s.token, 7200));
  return res;
}
