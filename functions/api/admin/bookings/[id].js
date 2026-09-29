import { json, badRequest, requireAdmin } from '../../_lib.js';

export async function onRequestPost(context) {
  const { DB } = context.env;
  const session = await requireAdmin(DB, context.request);
  if (!session) return json({ error: 'Session expired - sign in again' }, 401);
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const { action } = body || {};

  const id = parseInt(context.params.id, 10);
  const booking = await DB.prepare('SELECT id, status FROM bookings WHERE id = ? AND clinic_id = ?').bind(id, session.clinic_id).first();
  if (!booking) return json({ error: 'Booking not found' }, 404);

  let status;
  if (action === 'confirm') status = 'confirmed';
  else if (action === 'cancel') status = 'cancelled';
  else return badRequest('action must be confirm or cancel');

  await DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
  return json({ ok: true, id, status });
}
