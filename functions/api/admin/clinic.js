import { json, badRequest, requireAdmin, daysLabel } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  const c = await DB.prepare('SELECT id, name, area, address, phone, tagline, specialties, timings FROM clinics WHERE id = ?').bind(s.clinic_id).first();
  const docs = await DB.prepare('SELECT id, name, specialty, qualification, experience_years, fee, days, sessions FROM doctors WHERE clinic_id = ? ORDER BY name').bind(s.clinic_id).all();
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
  await DB.prepare('UPDATE clinics SET address = ?, phone = ?, tagline = ?, timings = ? WHERE id = ?').bind(address, phone, tagline, timings, s.clinic_id).run();
  return json({ ok: true });
}
