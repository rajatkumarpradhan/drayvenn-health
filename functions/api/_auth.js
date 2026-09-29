/* Patient auth helpers: sessions, OTP hashing, rate limiting.
   Design bar: OTPs PBKDF2-hashed at rest with per-code salt, 10-min expiry,
   5 attempts then block; sessions random 32B tokens stored SHA-256 hashed,
   30-day expiry, 7-day rotation; generic responses that never reveal
   whether a number is registered. */
import { json, hashPassword, safeEqualHex, normalizePhone } from './_lib.js';

export const SESSION_COOKIE = 'dh_session';
const SESSION_TTL_SEC = 30 * 24 * 3600;      // absolute session lifetime: 30 days
const SESSION_ROTATE_SEC = 7 * 24 * 3600;    // rotate token after 7 days of use

export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}
export function randomOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}
export async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function hashOtp(code, saltHex) {
  return hashPassword(code, saltHex); // PBKDF2-SHA256, per-code random salt
}
export { safeEqualHex, normalizePhone };

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

/* Sliding-window rate limiter with block, backed by auth_rate.
   Returns { limited: bool, retryAfterMin: int|null } and records one hit. */
export async function rateLimit(DB, key, maxHits, windowSec, blockSec) {
  const now = new Date();
  const row = await DB.prepare('SELECT count, window_start, blocked_until FROM auth_rate WHERE key = ?').bind(key).first();
  if (row && row.blocked_until && row.blocked_until > now.toISOString()) {
    const mins = Math.max(1, Math.ceil((new Date(row.blocked_until) - now) / 60000));
    return { limited: true, retryAfterMin: mins };
  }
  let count = 1, ws = now;
  if (row && (now - new Date(row.window_start)) < windowSec * 1000) {
    count = row.count + 1; ws = new Date(row.window_start);
  }
  let blocked = null;
  if (count > maxHits) { blocked = new Date(now.getTime() + blockSec * 1000).toISOString(); }
  await DB.prepare(
    `INSERT INTO auth_rate (key, count, window_start, blocked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_start = excluded.window_start, blocked_until = excluded.blocked_until`
  ).bind(key, count, ws.toISOString(), blocked).run();
  if (blocked) return { limited: true, retryAfterMin: Math.ceil(blockSec / 60) };
  return { limited: false, retryAfterMin: null };
}

export function sessionCookie(token, maxAgeSec = SESSION_TTL_SEC) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}
function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/* Creates a session row for a patient, returns the raw token (only ever sent as a cookie). */
export async function createSession(DB, patientId, request, rotatedFrom = null) {
  const token = randomToken(32);
  const tokenHash = await sha256hex(token);
  const expires = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  const ua = (request.headers.get('user-agent') || '').slice(0, 200);
  await DB.prepare(
    'INSERT INTO auth_sessions (patient_id, token_hash, expires_at, rotated_from, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).bind(patientId, tokenHash, expires, rotatedFrom, ua).run();
  return { token, maxAge: SESSION_TTL_SEC };
}

/* Reads the session cookie, returns { patient, sessionId, needsRotation } or null. */
export async function getPatientSession(DB, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const tokenHash = await sha256hex(token);
  const row = await DB.prepare(
    `SELECT s.id AS session_id, s.created_at AS session_created, p.*
     FROM auth_sessions s JOIN patients p ON p.id = s.patient_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  ).bind(tokenHash).first();
  if (!row) return null;
  const ageSec = (Date.now() - new Date(row.session_created + 'Z')) / 1000;
  return {
    patient: {
      id: row.id, phone: row.phone, google_sub: row.google_sub,
      google_email: row.google_email, name: row.name, age: row.age
    },
    sessionId: row.session_id,
    needsRotation: ageSec > SESSION_ROTATE_SEC
  };
}

/* Rotates a session: deletes the old row, returns a fresh { token, maxAge }. */
export async function rotateSession(DB, sessionId, patientId, request) {
  await DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(sessionId).run();
  return createSession(DB, patientId, request, sessionId);
}

export async function destroySession(DB, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const tokenHash = await sha256hex(token);
    await DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
}

/* Applies rotation + cookie to a JSON response when needed. */
export async function withSessionMaintenance(DB, sessionState, request, response) {
  if (sessionState && sessionState.needsRotation) {
    const { token, maxAge } = await rotateSession(DB, sessionState.sessionId, sessionState.patient.id, request);
    response.headers.append('Set-Cookie', sessionCookie(token, maxAge));
  }
  return response;
}

export async function logAuthEvent(DB, patientId, event, meta = null) {
  await DB.prepare('INSERT INTO auth_events (patient_id, event, meta) VALUES (?, ?, ?)')
    .bind(patientId, event, meta ? JSON.stringify(meta).slice(0, 500) : null).run();
}

export function unauthorized() {
  return json({ error: 'Sign in to continue' }, 401);
}
