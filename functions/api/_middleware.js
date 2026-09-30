/* Database isolation: preview deployments (branch aliases, per-deployment hash URLs)
   read/write the isolated demo database, never the production patient DB.
   wrangler pages deploy overwrites dashboard-level preview bindings, so the swap
   happens here by host. Production hosts keep the production DB binding. */
const PROD_HOSTS = new Set(['drayvenn-health.pages.dev', 'drayvennlab.in', 'www.drayvennlab.in']);

export async function onRequest(context) {
  const host = new URL(context.request.url).hostname;
  if (!PROD_HOSTS.has(host) && context.env.DB_PREVIEW) {
    context.env.DB = context.env.DB_PREVIEW;
  }
  return context.next();
}
