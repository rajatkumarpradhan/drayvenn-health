import { requireOwner, ownerJson, audit, hashPassword, randomToken, checkPassword } from '../_owner.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const t = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

function cleanDoctor(b, i) {
  const name = t(b.name, 80), specialty = t(b.specialty, 60), qualification = t(b.qualification, 100);
  const exp = parseInt(b.experience_years, 10), fee = parseInt(b.fee, 10);
  const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number))].filter(d => d >= 0 && d <= 6).sort() : [];
  const sessions = Array.isArray(b.sessions) ? b.sessions.slice(0, 3).map(x => ({ start: t(x && x.start, 5), end: t(x && x.end, 5) })) : [];
  const p = `Doctor ${i + 1}: `;
  if (name.length < 3) return { error: p + 'enter the doctor name' };
  if (specialty.length < 2) return { error: p + 'enter the specialty' };
  if (qualification.length < 2) return { error: p + 'enter the qualification' };
  if (!(exp >= 0 && exp <= 70)) return { error: p + 'experience must be 0 to 70 years' };
  if (!(fee >= 0 && fee <= 20000)) return { error: p + 'fee must be between 0 and 20000' };
  if (!days.length) return { error: p + 'pick at least one working day' };
  if (!sessions.length) return { error: p + 'add a time session' };
  for (const x of sessions) if (!HHMM.test(x.start) || !HHMM.test(x.end) || x.start >= x.end) return { error: p + 'each session needs a start time before its end time' };
  return { v: { name, specialty, qualification, exp, fee, days, sessions } };
}
function slugify(n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'clinic'; }
function derivedTimings(docs) {
  const days = [...new Set(docs.flatMap(d => d.days))].sort();
  const starts = docs.flatMap(d => d.sessions.map(s => s.start)).sort();
  const ends = docs.flatMap(d => d.sessions.map(s => s.end)).sort();
  const f = h => { const [H, M] = h.split(':').map(Number); return `${((H + 11) % 12) + 1}${M ? ':' + String(M).padStart(2, '0') : ''} ${H < 12 ? 'AM' : 'PM'}`; };
  const run = days.length === 7 ? 'Every day' : days.length > 1 && days[days.length - 1] - days[0] === days.length - 1 ? `${DAY[days[0]]} - ${DAY[days[days.length - 1]]}` : days.map(d => DAY[d]).join(', ');
  return `${run}, ${f(starts[0])} - ${f(ends[ends.length - 1])}`;
}

export async function onRequestGet(context) {
  const { DB } = context.env;
  if (!(await requireOwner(DB, context.request))) return ownerJson({ error: 'Session expired - sign in again' }, 401);
  const rows = await DB.prepare(
    `SELECT c.id, c.name, c.area, c.phone, a.email AS admin_email,
       (SELECT COUNT(*) FROM doctors d WHERE d.clinic_id = c.id AND d.active = 1) AS doctors
     FROM clinics c LEFT JOIN clinic_admins a ON a.clinic_id = c.id ORDER BY c.name`).all();
  return ownerJson({ clinics: rows.results });
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  if (!(await requireOwner(DB, context.request, { write: true }))) return ownerJson({ error: 'Session expired - sign in again' }, 401);
  let b; try { b = await context.request.json(); } catch { return ownerJson({ error: 'Invalid request' }, 400); }
  const c = b.clinic || {}, a = b.admin || {};
  const name0 = t(c.name, 80).replace(/^SAMPLE\s*-\s*/i, '');
  const area = t(c.area, 60), address = t(c.address, 200);
  const phone = t(c.phone, 20).replace(/[^\d+ ]/g, '').trim();
  const sample = c.sample === true;
  if (name0.length < 3) return ownerJson({ error: 'Enter the clinic name' }, 400);
  if (area.length < 2) return ownerJson({ error: 'Enter the area' }, 400);
  if (address.length < 8) return ownerJson({ error: 'Enter the full address' }, 400);
  const digits = phone.replace(/\D/g, '');
  if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith('91')) || (digits.length >= 8 && digits.length <= 11 && digits[0] === '0'))) return ownerJson({ error: 'Enter a valid clinic phone number' }, 400);
  const email = t(a.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ownerJson({ error: 'Enter a valid clinic admin email' }, 400);
  const bad = checkPassword(a.password);
  if (bad) return ownerJson({ error: 'Clinic admin password: ' + bad.charAt(0).toLowerCase() + bad.slice(1) }, 400);
  const dIn = Array.isArray(b.doctors) ? b.doctors : [];
  if (dIn.length < 1 || dIn.length > 3) return ownerJson({ error: 'Add 1 to 3 doctors' }, 400);
  const docs = [];
  for (let i = 0; i < dIn.length; i++) { const r = cleanDoctor(dIn[i] || {}, i); if (r.error) return ownerJson({ error: r.error }, 400); docs.push(r.v); }
  const specs = t(c.specialties, 200) ? [...new Set(t(c.specialties, 200).split(',').map(x => x.trim()).filter(Boolean))].slice(0, 8) : [...new Set(docs.map(d => d.specialty))];
  const timings = t(c.timings, 120) || derivedTimings(docs);

  const owner = await DB.prepare('SELECT email FROM owner_account WHERE id = 1').first();
  const taken = await DB.prepare('SELECT 1 AS x FROM clinic_admins WHERE email = ? UNION SELECT 1 FROM doctor_admins WHERE email = ? UNION SELECT 1 FROM platform_admins WHERE email = ?').bind(email, email, email).first();
  if (taken || (owner && owner.email === email)) return ownerJson({ error: 'That login email is already in use' }, 409);
  const dup = await DB.prepare('SELECT 1 AS x FROM clinics WHERE lower(replace(name, \'SAMPLE - \', \'\')) = lower(?) AND lower(area) = lower(?)').bind(name0, area).first();
  if (dup) return ownerJson({ error: 'A clinic with this name already exists in this area' }, 409);

  const name = (sample ? 'SAMPLE - ' : '') + name0;
  let id = slugify(name0), n = 0;
  while (await DB.prepare('SELECT 1 AS x FROM clinics WHERE id = ?').bind(id).first()) id = slugify(name0) + '-' + (++n + 1);
  const salt = randomToken(16), hash = await hashPassword(String(a.password), salt);
  const stmts = [
    DB.prepare('INSERT INTO clinics (id, name, area, address, phone, tagline, specialties, timings, rating, reviews_count, admin_pin) VALUES (?,?,?,?,?,?,?,?,0,0,?)')
      .bind(id, name, area, address, phone, '', JSON.stringify(specs), timings, 'unused'),
    DB.prepare('INSERT INTO clinic_admins (clinic_id, email, salt, password_hash) VALUES (?,?,?,?)').bind(id, email, salt, hash)
  ];
  const docIds = [];
  for (const d of docs) {
    const did = 'dr-' + randomToken(5); docIds.push(did);
    stmts.push(DB.prepare('INSERT INTO doctors (id, clinic_id, name, specialty, qualification, experience_years, fee, days, sessions) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(did, id, d.name, d.specialty, d.qualification, d.exp, d.fee, JSON.stringify(d.days), JSON.stringify(d.sessions)));
  }
  await DB.batch(stmts);
  await audit(DB, 'clinic_created', `${id} | ${email} | ${docs.length} doctor(s)${sample ? ' | sample' : ''}`);
  return ownerJson({ ok: true, clinic: { id, name, area, address, phone, timings, specialties: specs, sample }, admin_email: email, doctors: docs.map((d, i) => ({ id: docIds[i], name: d.name })) });
}
