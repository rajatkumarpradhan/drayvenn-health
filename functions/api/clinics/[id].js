import { json, daysLabel, computeNextAvailable } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const id = context.params.id;
  const clinic = await DB.prepare(
    'SELECT id, name, area, address, phone, tagline, specialties, rating, reviews_count, timings, emoji FROM clinics WHERE id = ?'
  ).bind(id).first();
  if (!clinic) return json({ error: 'Clinic not found' }, 404);
  const doctors = await DB.prepare(
    'SELECT id, clinic_id, name, specialty, qualification, experience_years, fee, days, sessions FROM doctors WHERE clinic_id = ? ORDER BY fee'
  ).bind(id).all();
  const nexts = await computeNextAvailable(DB, doctors.results);
  const pubs = doctors.results.map(d => {
    const { days, sessions, ...pub } = d;
    pub.days_label = daysLabel(days);
    pub.next_available = nexts[d.id] || null;
    return pub;
  });
  return json({ clinic: { ...clinic, specialties: JSON.parse(clinic.specialties), doctors: pubs } });
}
