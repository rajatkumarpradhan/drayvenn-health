import { adminTokenFrom, adminSessionByToken } from '../api/_lib.js';

/* Server-side gate for every /clinic-admin/* page. The HTML is only served when the request carries a valid
   session cookie; otherwise the visitor gets a 302 to /clinic-admin/login before any panel markup is sent.
   Clinic and doctor sessions open the panel; team (platform) sessions only open /clinic-admin/platform. */
const PROD_HOSTS = new Set(['drayvenn-health.pages.dev', 'drayvennlab.in', 'www.drayvennlab.in']);
const PUBLIC = new Set(['login', 'login.html']);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!PROD_HOSTS.has(url.hostname) && context.env.DB_PREVIEW) context.env.DB = context.env.DB_PREVIEW;
  const page = url.pathname.replace(/^\/clinic-admin\/?/, '').replace(/\/$/, '');
  if (PUBLIC.has(page)) return context.next();
  const toLogin = () => new Response(null, { status: 302, headers: { Location: '/clinic-admin/login', 'Cache-Control': 'no-store' } });
  const t = adminTokenFrom(context.request);
  if (!t || !t.cookie) return toLogin();
  const s = await adminSessionByToken(context.env.DB, t.token);
  if (!s) return toLogin();
  const isPlatformPage = page === 'platform' || page === 'platform.html';
  const isPlatform = s.clinic_id === '__platform__';
  if (isPlatform !== isPlatformPage) return new Response(null, { status: 302, headers: { Location: isPlatform ? '/clinic-admin/platform' : '/clinic-admin/dashboard', 'Cache-Control': 'no-store' } });
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
