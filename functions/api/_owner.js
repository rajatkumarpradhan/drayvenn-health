/* Owner (super admin) auth. Fully separate from clinic/doctor/platform sessions:
   own account table, own session table, own cookie. No default credentials -
   the account is created once through a single-use setup link.
   Sessions: random 32B token (only its SHA-256 is stored), 2h absolute, 30 min idle,
   cookie __Host- prefixed, HttpOnly, Secure, SameSite=Strict.
   CSRF: every state-changing call needs the per-session X-CSRF-Token AND a same-origin Origin header. */
import { json, hashPassword, safeEqualHex, sha256Hex } from './_lib.js';
import { randomToken, rateLimit, clientIp } from './_auth.js';

export const OWNER_COOKIE = '__Host-dh_owner';
const ABS_MIN = 120, IDLE_MIN = 30;

export function ownerCookie(token, maxAge) {
  return `${OWNER_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
export function sameOrigin(request) {
  const o = request.headers.get('Origin');
  if (!o) return false;
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
}
export function noStore(res) {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
export function ownerJson(data, status = 200) { return noStore(json(data, status)); }

export function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 12) return 'Use at least 12 characters';
  if (pw.length > 128) return 'Password is too long';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (classes < 3 && pw.length < 20) return 'Mix upper case, lower case, numbers and symbols (or make it 20+ characters)';
  if (/^(.)\1+$/.test(pw) || /password|12345678|qwerty|drayvenn/i.test(pw)) return 'That password is too easy to guess';
  return null;
}

/* Returns { session, csrf } or null. Slides the idle window. */
export async function requireOwner(DB, request, { write = false } = {}) {
  const tok = readCookie(request, OWNER_COOKIE);
  if (!tok || !/^[0-9a-f]{64}$/.test(tok)) return null;
  const row = await DB.prepare('SELECT token_hash, csrf, last_seen, expires_at FROM owner_sessions WHERE token_hash = ?').bind(await sha256Hex(tok)).first();
  if (!row) return null;
  const now = Date.now();
  const idleOk = now - new Date(row.last_seen.replace(' ', 'T') + 'Z').getTime() < IDLE_MIN * 60000;
  const absOk = new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() > now;
  if (!idleOk || !absOk) {
    await DB.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').bind(row.token_hash).run();
    return null;
  }
  if (write) {
    if (!sameOrigin(request)) return null;
    if (!safeEqualHex(request.headers.get('X-CSRF-Token') || '', row.csrf)) return null;
  }
  await DB.prepare("UPDATE owner_sessions SET last_seen = datetime('now') WHERE token_hash = ?").bind(row.token_hash).run();
  return { csrf: row.csrf, token_hash: row.token_hash };
}

export async function startSession(DB) {
  await DB.prepare("DELETE FROM owner_sessions WHERE expires_at <= datetime('now') OR last_seen <= datetime('now', ?)").bind(`-${IDLE_MIN} minutes`).run();
  const token = randomToken(32), csrf = randomToken(24);
  await DB.prepare("INSERT INTO owner_sessions (token_hash, csrf, expires_at) VALUES (?, ?, datetime('now', ?))")
    .bind(await sha256Hex(token), csrf, `+${ABS_MIN} minutes`).run();
  return { token, csrf };
}
export async function audit(DB, action, detail) {
  await DB.prepare('INSERT INTO owner_audit (action, detail) VALUES (?, ?)').bind(action, detail ? String(detail).slice(0, 300) : null).run();
}
export { rateLimit, clientIp, hashPassword, safeEqualHex, sha256Hex, randomToken, json };
