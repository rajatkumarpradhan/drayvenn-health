import { json, badRequest } from './_lib.js';
import { rateLimit, clientIp } from './_auth.js';
import { sendPlainEmail } from './_email.js';

/* Public "Join as a clinic" request. Stores only the business contact details the clinic types in. */
export async function onRequestPost(context) {
  const { DB } = context.env;
  let b;
  try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const t = (v, n) => String((v || '')).trim().slice(0, n);
  const clinic_name = t(b.clinic_name, 100), contact_name = t(b.contact_name, 80), email = t(b.email, 120).toLowerCase();
  const phone = t(b.phone, 20).replace(/[^\d+ ]/g, ''), area = t(b.area, 80), specialties = t(b.specialties, 200), message = t(b.message, 500);
  if (b.website) return json({ ok: true }); // honeypot
  if (clinic_name.length < 3) return badRequest('Enter your clinic name');
  if (contact_name.length < 2) return badRequest('Enter the contact person name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Enter a valid email');
  if (phone.replace(/\D/g, '').length < 10) return badRequest('Enter a valid 10-digit phone number');
  if (area.length < 2) return badRequest('Enter the area / locality in Bengaluru');
  const rl = await rateLimit(DB, 'clinic-req:' + clientIp(context.request), 3, 3600, 6 * 3600);
  if (rl.limited) return json({ error: 'Too many requests from this device. Try again later.' }, 429);
  await DB.prepare('INSERT INTO clinic_requests (clinic_name, contact_name, email, phone, area, specialties, message) VALUES (?,?,?,?,?,?,?)')
    .bind(clinic_name, contact_name, email, phone, area, specialties, message).run();
  await sendPlainEmail(context.env, 'hello@drayvennlab.in', 'New clinic request: ' + clinic_name,
    `${clinic_name} (${area})\nContact: ${contact_name}, ${phone}, ${email}\nSpecialties: ${specialties}\n${message}`).catch(() => {});
  return json({ ok: true });
}
