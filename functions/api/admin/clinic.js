import { json, badRequest, requireAdmin, daysLabel } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  const c = await DB.prepare('SELECT id, name, area, address, phone, tagline, specialties, timings, (logo IS NOT NULL) AS has_logo FROM clinics WHERE id = ?').bind(s.clinic_id).first();
  const docs = await DB.prepare('SELECT id, name, specialty, qualification, experience_years, fee, days, sessions, active FROM doctors WHERE clinic_id = ? ORDER BY name').bind(s.clinic_id).all();
  const logins = await DB.prepare('SELECT doctor_id, email FROM doctor_admins WHERE clinic_id = ?').bind(s.clinic_id).all();
  const le = {}; for (const l of logins.results) le[l.doctor_id] = l.email;
  let specs = []; try { specs = JSON.parse(c.specialties); } catch {}
  return json({
    role: s.doctor_id ? 'doctor' : 'clinic',
    clinic: { ...c, specialties: specs },
    doctors: (s.doctor_id ? docs.results.filter(d => d.id === s.doctor_id) : docs.results).map(d => ({
      ...d, days: JSON.parse(d.days), sessions: JSON.parse(d.sessions), login_email: s.doctor_id ? undefined : (le[d.id] || null)
    }))
  });
}

export async function onRequestPut(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  if (s.doctor_id) return json({ error: 'Only the clinic account can edit clinic details' }, 403);
  let b; try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const address = t(b.address, 200), phone = t(b.phone, 20).replace(/[^\d+ ]/g, ''), tagline = t(b.tagline, 120), timings = t(b.timings, 100);
  if (address.length < 5) return badRequest('Enter the clinic address');
  if (phone.replace(/\D/g, '').length < 10) return badRequest('Enter a valid phone number');
  if (timings.length < 3) return badRequest('Enter clinic timings, e.g. Mon-Sat 9 AM - 8 PM');
  const cur = await DB.prepare('SELECT name FROM clinics WHERE id = ?').bind(s.clinic_id).first();
  let name = t(b.name, 80);
  if (name.length < 3) return badRequest('Enter the clinic name');
  /* Sample clinics keep their SAMPLE tag so demo data is never mistaken for a real clinic. */
  if (/^SAMPLE\b/i.test(cur.name) && !/^SAMPLE\b/i.test(name)) name = 'SAMPLE - ' + name;
  let specs = null;
  if (Array.isArray(b.specialties)) {
    specs = [...new Set(b.specialties.map(x => t(x, 40)).filter(Boolean))].slice(0, 8);
    if (!specs.length) return badRequest('Add at least one specialty');
  }
  await DB.prepare('UPDATE clinics SET name = ?, address = ?, phone = ?, tagline = ?, timings = ?' + (specs ? ', specialties = ?' : '') + ' WHERE id = ?')
    .bind(...[name, address, phone, tagline, timings].concat(specs ? [JSON.stringify(specs)] : []).concat([s.clinic_id])).run();
  if (name !== cur.name) await DB.prepare('UPDATE bookings SET clinic_name = ? WHERE clinic_id = ?').bind(name, s.clinic_id).run();
  return json({ ok: true });
}
