import { json } from '../_lib.js';
import { getPatientSession, withSessionMaintenance, unauthorized } from '../_auth.js';

/* /api/my/family - family members for the signed-in patient.
   GET: list. POST {action:'add', name, age, gender, relation}. POST {action:'remove', id}. */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  const rows = await DB.prepare(
    'SELECT id, name, age, gender, relation FROM family_members WHERE patient_id = ? ORDER BY created_at'
  ).bind(state.patient.id).all();
  const res = json({ members: rows.results });
  return withSessionMaintenance(DB, state, context.request, res);
}

export async function onRequestPost(context) {
  const { DB } = context.env;
  const state = await getPatientSession(DB, context.request);
  if (!state) return unauthorized();
  const body = await context.request.json().catch(() => ({}));
  const action = (body.action || '').toString();
  if (action === 'add') {
    const name = (body.name || '').toString().trim().slice(0, 60);
    const age = body.age === null || body.age === undefined || body.age === '' ? null : Math.min(120, Math.max(0, parseInt(body.age, 10) || 0));
    const gender = (body.gender || '').toString().slice(0, 12).trim() || null;
    const relation = (body.relation || '').toString().slice(0, 24).trim() || null;
    if (name.length < 2) return json({ error: 'Enter the family member name.' }, 400);
    if (!relation) return json({ error: 'Choose the relation.' }, 400);
    const count = await DB.prepare('SELECT COUNT(*) AS n FROM family_members WHERE patient_id = ?').bind(state.patient.id).first();
    if (count.n >= 10) return json({ error: 'Maximum 10 family members.' }, 400);
    await DB.prepare('INSERT INTO family_members (patient_id, name, age, gender, relation) VALUES (?, ?, ?, ?, ?)')
      .bind(state.patient.id, name, age, gender, relation).run();
    const rows = await DB.prepare('SELECT id, name, age, gender, relation FROM family_members WHERE patient_id = ? ORDER BY created_at').bind(state.patient.id).all();
    const res = json({ ok: true, members: rows.results });
    return withSessionMaintenance(DB, state, context.request, res);
  }
  if (action === 'edit') {
    const id = parseInt(body.id, 10) || 0;
    const name = (body.name || '').toString().trim().slice(0, 60);
    const age = body.age === null || body.age === undefined || body.age === '' ? null : Math.min(120, Math.max(0, parseInt(body.age, 10) || 0));
    const gender = (body.gender || '').toString().slice(0, 12).trim() || null;
    const relation = (body.relation || '').toString().slice(0, 24).trim() || null;
    if (name.length < 2) return json({ error: 'Enter the family member name.' }, 400);
    if (!relation) return json({ error: 'Choose the relation.' }, 400);
    const r = await DB.prepare('UPDATE family_members SET name = ?, age = ?, gender = ?, relation = ? WHERE id = ? AND patient_id = ?').bind(name, age, gender, relation, id, state.patient.id).run();
    if (!r.meta || !r.meta.changes) return json({ error: 'Family member not found.' }, 404);
    const rows = await DB.prepare('SELECT id, name, age, gender, relation FROM family_members WHERE patient_id = ? ORDER BY created_at').bind(state.patient.id).all();
    const res = json({ ok: true, members: rows.results });
    return withSessionMaintenance(DB, state, context.request, res);
  }
  if (action === 'remove') {
    const id = parseInt(body.id, 10) || 0;
    await DB.prepare('DELETE FROM family_members WHERE id = ? AND patient_id = ?').bind(id, state.patient.id).run();
    const res = json({ ok: true });
    return withSessionMaintenance(DB, state, context.request, res);
  }
  return json({ error: 'Unknown action' }, 400);
}
