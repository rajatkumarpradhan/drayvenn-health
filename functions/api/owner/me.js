import { requireOwner, ownerJson } from '../_owner.js';
/* Public state check: is the owner account set up, and is there a live session? */
export async function onRequestGet(context) {
  const { DB } = context.env;
  const acct = await DB.prepare('SELECT email FROM owner_account WHERE id = 1').first();
  const s = acct ? await requireOwner(DB, context.request) : null;
  if (!s) return ownerJson({ authed: false, configured: !!acct });
  return ownerJson({ authed: true, configured: true, email: acct.email, csrf: s.csrf });
}
