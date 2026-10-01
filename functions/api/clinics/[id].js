import { json, daysLabel, computeNextAvailable } from '../_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const id = context.params.id;
  const clinic = await DB.prepare(
    'SELECT id, name, area, address, phone, tagline, specialties, timings, emoji, cover_video FROM clinics WHERE id = ?'
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
  const clinicNext = pubs.map(d => d.next_available).filter(Boolean)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || null;
  return json({ clinic: { ...clinic, specialties: JSON.parse(clinic.specialties), doctors: pubs, min_fee: Math.min(...pubs.map(d => d.fee)), next_available: clinicNext } });
}
