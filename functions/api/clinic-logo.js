import { json, badRequest, requireAdmin } from './_lib.js';

/* GET /api/clinic-logo?id=<clinic_id>  public image (clinic logo)
   POST   {data: "data:image/png;base64,..."}  clinic account sets its logo (max ~200 KB)
   DELETE clinic account removes it */
const RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function onRequestGet(context) {
  const { DB } = context.env;
  const id = new URL(context.request.url).searchParams.get('id') || '';
  const row = await DB.prepare('SELECT logo FROM clinics WHERE id = ?').bind(id).first();
  const m = row && row.logo ? RE.exec(row.logo) : null;
  if (!m) return new Response('Not found', { status: 404 });
  const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=300' } });
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  if (s.doctor_id) return json({ error: 'Only the clinic account can change the logo' }, 403);
  let b; try { b = await context.request.json(); } catch { return badRequest('Invalid JSON'); }
  const data = String((b || {}).data || '');
  if (data.length > 280000) return badRequest('Logo is too large. Use an image under 200 KB.');
  if (!RE.test(data)) return badRequest('Upload a PNG, JPEG or WebP image');
  await DB.prepare('UPDATE clinics SET logo = ? WHERE id = ?').bind(data, s.clinic_id).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const { DB } = context.env;
  const s = await requireAdmin(DB, context.request);
  if (!s) return json({ error: 'Session expired - sign in again' }, 401);
  if (s.doctor_id) return json({ error: 'Only the clinic account can change the logo' }, 403);
  await DB.prepare('UPDATE clinics SET logo = NULL WHERE id = ?').bind(s.clinic_id).run();
  return json({ ok: true });
}
