export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Returns a Date shifted so its UTC getters read as IST wall-clock time.
export function nowIST() {
  return new Date(Date.now() + 330 * 60000);
}

export function istToday() {
  return nowIST().toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function generateSlots(doctor, dateStr) {
  let days, sessions;
  try { days = JSON.parse(doctor.days); sessions = JSON.parse(doctor.sessions); }
  catch { return []; }
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  if (!days.includes(day)) return [];
  const out = [];
  for (const s of sessions) {
    let [h, m] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    while (h * 60 + m < eh * 60 + em) {
      out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
      m += 30;
      if (m >= 60) { h++; m -= 60; }
    }
  }
  return out;
}

export function makeRef() {
  // 10 random characters (unambiguous alphabet) - refs issued earlier stay valid.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let ref = 'DH-';
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 10; i++) ref += chars[buf[i] % chars.length];
  return ref;
}

/* Password hashing: PBKDF2-SHA256, 100k iterations, 32-byte key, hex. */
export async function hashPassword(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Retention: bookings auto-delete 1 year after the appointment date.
   Pages has no cron, so this runs on API touchpoints (create booking, admin summary). */
export async function purgeOldBookings(DB) {
  await DB.prepare("DELETE FROM bookings WHERE date < date('now', '-1 year')").run();
}

export function badRequest(msg) {
  return json({ error: msg }, 400);
}

export function normalizePhone(p) {
  const digits = (p || '').toString().replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

export async function requireAdmin(DB, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return DB.prepare(
    `SELECT s.clinic_id, s.doctor_id, c.name AS clinic_name FROM admin_sessions s
     JOIN clinics c ON c.id = s.clinic_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function daysLabel(daysJson) {
  try {
    const ds = JSON.parse(daysJson).slice().sort();
    if (ds.length === 7) return 'Mon-Sun';
    const key = ds.join(',');
    if (key === '1,2,3,4,5,6') return 'Mon-Sat';
    if (key === '1,2,3,4,5') return 'Mon-Fri';
    return ds.map(d => DOW[d]).join(', ');
  } catch { return ''; }
}

// Returns { doctorId: nextAvailable } for the given doctor rows (must include id, days, sessions).
export async function computeNextAvailable(DB, doctors) {
  const today = istToday();
  const ids = doctors.map(d => d.id);
  if (!ids.length) return {};
  const marks = ids.map(() => '?').join(',');
  const taken = await DB.prepare(
    `SELECT doctor_id, date, slot FROM bookings WHERE date >= ? AND status != 'cancelled' AND doctor_id IN (${marks})`
  ).bind(today, ...ids).all();
  const takenMap = {};
  for (const r of taken.results) {
    (takenMap[r.doctor_id] = takenMap[r.doctor_id] || []).push(r.date + '|' + r.slot);
  }
  const n = nowIST();
  const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');
  const out = {};
  for (const doc of doctors) {
    const booked = new Set(takenMap[doc.id] || []);
    let next = null;
    for (let i = 0; i < 14 && !next; i++) {
      const date = addDays(today, i);
      for (const slot of generateSlots(doc, date)) {
        if (i === 0 && slot <= cutoff) continue;
        if (!booked.has(date + '|' + slot)) {
          next = { date, time: slot, today: i === 0, tomorrow: i === 1 };
          break;
        }
      }
    }
    out[doc.id] = next;
  }
  return out;
}
