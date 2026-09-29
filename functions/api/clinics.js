import { json, generateSlots, nowIST, istToday, addDays, daysLabel, computeNextAvailable } from './_lib.js';

export async function onRequestGet(context) {
  const { DB } = context.env;
  const clinics = await DB.prepare(
    'SELECT id, name, area, address, phone, tagline, specialties, rating, reviews_count, timings, emoji FROM clinics ORDER BY rating DESC'
  ).all();
  const doctors = await DB.prepare(
    'SELECT id, clinic_id, name, specialty, qualification, experience_years, fee, days, sessions FROM doctors ORDER BY fee'
  ).all();

  const today = istToday();
  const taken = await DB.prepare(
    "SELECT doctor_id, date, slot FROM bookings WHERE date >= ? AND status != 'cancelled'"
  ).bind(today).all();
  const takenMap = {};
  for (const r of taken.results) {
    (takenMap[r.doctor_id] = takenMap[r.doctor_id] || []).push(r.date + '|' + r.slot);
  }
  const n = nowIST();
  const cutoff = String(n.getUTCHours()).padStart(2, '0') + ':' + String(n.getUTCMinutes()).padStart(2, '0');

  function nextAvailable(doc) {
    const booked = new Set(takenMap[doc.id] || []);
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      for (const slot of generateSlots(doc, date)) {
        if (i === 0 && slot <= cutoff) continue;
        if (!booked.has(date + '|' + slot)) {
          return { date, time: slot, today: i === 0, tomorrow: i === 1 };
        }
      }
    }
    return null;
  }

  const byClinic = {};
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function daysLabel(daysJson) {
    try {
      const ds = JSON.parse(daysJson).slice().sort();
      if (ds.length === 7) return 'Mon-Sun';
      const key = ds.join(',');
      if (key === '1,2,3,4,5,6') return 'Mon-Sat';
      if (key === '1,2,3,4,5') return 'Mon-Fri';
      return ds.map(d => DOW[d]).join(', ');
    } catch { return ''; }
  }
  for (const d of doctors.results) {
    const { days, sessions, ...pub } = d;
    pub.days_label = daysLabel(days);
    pub.next_available = nextAvailable(d);
    (byClinic[d.clinic_id] = byClinic[d.clinic_id] || []).push(pub);
  }
  const out = clinics.results.map(c => {
    const docs = byClinic[c.id] || [];
    const nexts = docs.map(d => d.next_available).filter(Boolean)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return {
      ...c,
      specialties: JSON.parse(c.specialties),
      doctors: docs,
      min_fee: Math.min(...docs.map(d => d.fee)),
      next_available: nexts[0] || null
    };
  });
  return json({ clinics: out });
}
