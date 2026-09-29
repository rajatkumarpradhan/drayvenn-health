// GET /api/stats - public aggregate counts only, no patient data
export async function onRequestGet({ env }) {
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled'").first();
  return Response.json({ bookings: total?.n || 0 }, { headers: { 'Cache-Control': 'public, max-age=60' } });
}
