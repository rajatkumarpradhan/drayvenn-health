import { ownerJson, sameOrigin, startSession, ownerCookie, audit, rateLimit, clientIp, hashPassword, safeEqualHex } from '../_owner.js';

const MAX_FAILS = 5, LOCK_MIN = 15;
const DUMMY_SALT = '00112233445566778899aabbccddeeff';

export async function onRequestPost(context) {
  const { DB } = context.env, request = context.request;
  if (!sameOrigin(request)) return ownerJson({ error: 'Request blocked' }, 403);
  // Rate limits: per IP, and one global ceiling so a spread-out guesser is capped too.
  const a = await rateLimit(DB, 'owner-login:' + clientIp(request), 8, 900, 1800);
  if (a.limited) return ownerJson({ error: `Too many attempts. Try again in ${a.retryAfterMin} minutes.` }, 429);
  const g = await rateLimit(DB, 'owner-login:all', 40, 3600, 3600);
  if (g.limited) return ownerJson({ error: 'Sign-in is temporarily paused. Try again later.' }, 429);
  let b; try { b = await request.json(); } catch { return ownerJson({ error: 'Invalid request' }, 400); }
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '').slice(0, 200);
  const acct = await DB.prepare('SELECT email, salt, password_hash, fails, locked_until FROM owner_account WHERE id = 1').first();
  if (!acct) return ownerJson({ error: 'Owner sign-in is not set up yet' }, 503);
  if (acct.locked_until && acct.locked_until > new Date().toISOString()) {
    return ownerJson({ error: 'Too many failed attempts. Account locked for a while - try again later.' }, 429);
  }
  // Always do the hash work so timing does not reveal whether the email matched.
  const emailOk = safeEqualHex(email.padEnd(120, ' ').slice(0, 120), acct.email.padEnd(120, ' ').slice(0, 120)) && email.length === acct.email.length;
  const hash = await hashPassword(password, emailOk ? acct.salt : DUMMY_SALT);
  if (!(emailOk && safeEqualHex(hash, acct.password_hash))) {
    const fails = acct.fails + 1;
    const locked = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60000).toISOString() : null;
    await DB.prepare('UPDATE owner_account SET fails = ?, locked_until = ? WHERE id = 1').bind(locked ? 0 : fails, locked).run();
    await audit(DB, 'owner_login_failed', clientIp(request));
    return ownerJson({ error: locked ? 'Too many failed attempts. Account locked for 15 minutes.' : 'Wrong email or password' }, 401);
  }
  await DB.prepare('UPDATE owner_account SET fails = 0, locked_until = NULL WHERE id = 1').run();
  await audit(DB, 'owner_login', clientIp(request));
  const s = await startSession(DB);
  const res = ownerJson({ ok: true, email: acct.email, csrf: s.csrf });
  res.headers.append('Set-Cookie', ownerCookie(s.token, 7200));
  return res;
}
