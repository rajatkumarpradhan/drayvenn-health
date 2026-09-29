import { json, badRequest, istToday, nowIST, daysLabel } from './_lib.js';

// Strongest free-catalog models first - first one that runs is cached for the isolate's life.
// Reasoning models (R1/QwQ) are excluded on purpose: their think-traces ruin chat UX.
const MODEL_CANDIDATES = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/meta/llama-3.2-3b-instruct'
];
let workingModel = null;
const DAILY_LIMIT = 40;

async function clinicContext(DB) {
  const clinics = await DB.prepare('SELECT * FROM clinics ORDER BY name').all();
  const doctors = await DB.prepare('SELECT * FROM doctors').all();
  const byClinic = {};
  for (const d of doctors.results) (byClinic[d.clinic_id] = byClinic[d.clinic_id] || []).push(d);
  return clinics.results.map(c => {
    const docs = (byClinic[c.id] || []).map(d =>
      `${d.name} (${d.specialty}, ${d.qualification}, ${d.experience_years} yrs, fee Rs${d.fee}, works ${daysLabel(d.days)})`
    ).join('; ');
    return `Clinic "${c.name}" [id ${c.id}] in ${c.area}. Address: ${c.address}. Timings: ${c.timings}. Phone: ${c.phone}. Specialties: ${c.specialties}. Doctors: ${docs}`;
  }).join('\n');
}

function systemPrompt(clinicsText) {
  const n = nowIST();
  const now = `${istToday()} ${String(n.getUTCHours()).padStart(2, '0')}:${String(n.getUTCMinutes()).padStart(2, '0')} IST`;
  return `You are Drayvenn Assistant, the 24x7 support chatbot of Drayvenn Health, a clinic appointment booking site for Marathahalli, Bengaluru. Current date/time: ${now}.

HOW THE PRODUCT WORKS
- Patients book on the site: pick a clinic, pick a doctor, pick date and time slot, enter name + 10-digit mobile. No sign-up, no online payment - patients pay at the clinic.
- After booking they get a reference like DH-XXXXX. The clinic then confirms the slot (status: pending -> confirmed).
- "Bookings" page: enter the booking reference + the mobile number used to book. It shows the status, details, and a cancel button for upcoming bookings. Phone-only listing does not exist - the reference is required.
- Patients can cancel an upcoming booking themselves from the Bookings page. For anything else they call the clinic directly.

CLINICS AND DOCTORS (live data)
${clinicsText}

RULES
- Keep answers under 45 words unless the user asks for a list (fees, doctors, timings). Be warm, plain, concrete. No headings; short bullet lines are ok for lists.
- When you recommend or name a specific clinic, append its token exactly: [[clinic:ID]] (use the id in brackets above). Example: "SmileCare Dental Studio is great for braces. [[clinic:smilecare-dental]]"
- If the user wants to book, give the steps in one line and name a fitting clinic with its token, or ask what problem / which doctor they need.
- Booking for a family member is fine: same steps, patient name = their name, mobile = the user's number. Each booking gets its own reference; multiple bookings on one number are allowed.
- To track, reschedule or cancel: sign in under "Bookings" for history and one-tap actions, or enter the booking reference + mobile in the Track section to check status or cancel.
- Never invent doctors, clinics, prices or timings - use only the data above. If you don't know, say so and give the clinic phone number.
- You are not a doctor and you never give medical advice - no diagnosis, no medicines, no dosages, no home remedies, no triage beyond pointing to emergency care. If asked for medical advice, say clearly that you only help with booking and clinic information, and they should consult the doctor. Never diagnose or prescribe. For severe symptoms (chest pain, breathing trouble, unconsciousness, heavy bleeding, high fever with confusion) tell them to call 108/112 or go to emergency FIRST, then offer the fitting clinic.
- For anything unrelated to Drayvenn Health (news, sports, coding, jokes, general knowledge), politely decline in one line and offer what you CAN do.
- Match the user's language - if they write in Hindi/Hinglish, reply the same way.

EXAMPLE CONVERSATIONS
User: How do I book for my mother?
Assistant: Open a clinic, tap "Book appointment" on a doctor, pick a date and time, and enter your mother's name with your mobile number. Pay at the clinic. What problem does she have? I can suggest the right clinic.

User: cheapest clinic for fever?
Assistant: For fever, Marathahalli Multispeciality Clinic is the right fit - Dr. Rohan Kulkarni consults at Rs350. [[clinic:marathahalli-multispeciality]]

User: my child has 104 fever and is breathing fast
Assistant: Please call 108 or 112 right now, or go to the nearest emergency room - do not wait for an appointment. Once she is stable, Motherhood Child & Family Clinic [[clinic:motherhood-child-family]] can see children today; their number is on the clinic page.

User: write me a poem about cricket
Assistant: I can only help with Drayvenn Health - booking appointments, clinic timings, fees, tracking and cancellations. Want me to help you find a doctor?

User: kal dentist chahiye, kaun hai?
Assistant: Kal SmileCare Dental Studio mein Dr. Vikram Shetty (Dentist, Rs300) available hain. [[clinic:smilecare-dental]] Site par clinic kholkar "Book appointment" dabaiye aur time choose kar lijiye.`;
}

/* ---------- rule-based fallback (no LLM needed) ---------- */
function fallbackReply(text, clinics, doctorsByClinic) {
  const t = (text || '').toLowerCase();
  const clinicLine = c => `${c.name} (${c.area}) - timings ${c.timings}, phone ${c.phone}. [[clinic:${c.id}]]`;
  const has = (...ws) => ws.some(w => t.includes(w));
  if (has('cancel')) {
    return 'Open "My bookings" from the top menu, enter your mobile number, and tap Cancel on the booking you want to drop. Upcoming bookings can be cancelled anytime; the clinic sees the update instantly.';
  }
  if (has('track', 'status', 'reference', 'ref')) {
    return 'Open "Track booking" from the top menu and enter your booking reference (looks like DH-XXXXX) plus the mobile number you booked with. You will see whether the clinic has confirmed your slot.';
  }
  if (has('book', 'appointment', 'slot', 'consult')) {
    return 'Booking takes under a minute: open a clinic, tap "Book appointment" on a doctor, pick a date and time, and enter your name and mobile. No payment online - you pay at the clinic. Here is one of our top-rated clinics: ' + clinicLine(clinics[0]);
  }
  if (has('time', 'timing', 'open', 'close', 'hour', 'when')) {
    return 'Clinic timings:\n' + clinics.map(c => `- ${c.name}: ${c.timings}`).join('\n');
  }
  if (has('fee', 'cost', 'price', 'charge', 'rupee', 'much')) {
    const lines = clinics.map(c => {
      const fees = (doctorsByClinic[c.id] || []).map(d => d.fee).filter(f => f != null);
      const min = fees.length ? Math.min(...fees) : null;
      return `- ${c.name}: ${min != null ? 'from Rs' + min : 'fee on request'}`;
    }).join('\n');
    return 'Consultation fees (pay at the clinic):\n' + lines;
  }
  if (has('doctor', 'dentist', 'skin', 'derma', 'child', 'paedia', 'bone', 'ortho', 'fever', 'general')) {
    const specMap = { dentist: 'dental', derma: 'derma', skin: 'derma', child: 'child', paedia: 'child', bone: 'ortho', ortho: 'ortho', fever: 'multi', general: 'multi' };
    const key = Object.keys(specMap).find(k => t.includes(k));
    let match = clinics[0];
    if (key) match = clinics.find(c => c.id.includes(specMap[key])) || clinics[0];
    const docs = (doctorsByClinic[match.id] || []).map(d => `${d.name} (${d.specialty}, Rs${d.fee})`).join(' and ');
    return `${match.name} looks right for that - ${docs} consult there. ${clinicLine(match)}`;
  }
  if (has('human', 'call', 'phone', 'contact', 'talk', 'speak', 'help')) {
    return 'You can call any clinic directly:\n' + clinics.map(c => `- ${c.name}: ${c.phone}`).join('\n') + '\nFor emergencies call 108/112.';
  }
  if (has('hi', 'hello', 'hey', 'namaste', 'namaskar')) {
    return 'Hi! I am the Drayvenn assistant, here 24x7. I can help you book an appointment, find the right doctor, check clinic timings or fees, or track a booking. What do you need?';
  }
  return 'I can help with booking an appointment, finding doctors, clinic timings and fees, tracking a booking, or cancelling one. What would you like to do?';
}

export async function onRequestPost(context) {
  const { DB, AI } = context.env;
  let body;
  try { body = await context.request.json(); }
  catch { return badRequest('Invalid JSON'); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 600) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') return badRequest('messages required');

  // per-IP daily cap
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const day = istToday();
  const usage = await DB.prepare('SELECT count FROM chat_usage WHERE ip = ? AND day = ?').bind(ip, day).first();
  if ((usage?.count || 0) >= DAILY_LIMIT) {
    return json({ reply: 'You have reached today\'s chat limit. Please call the clinic directly - the numbers are on each clinic page, or try me again tomorrow.', limit: true });
  }
  await DB.prepare(
    'INSERT INTO chat_usage (ip, day, count) VALUES (?, ?, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1'
  ).bind(ip, day).run();

  // live clinic data for both the LLM prompt and the fallback
  const clinics = await DB.prepare('SELECT * FROM clinics ORDER BY name').all();
  const doctors = await DB.prepare('SELECT * FROM doctors').all();
  const doctorsByClinic = {};
  for (const d of doctors.results) (doctorsByClinic[d.clinic_id] = doctorsByClinic[d.clinic_id] || []).push(d);

  const wantStream = new URL(context.request.url).searchParams.get('stream') === '1';
  let reply = null, mode = 'ai', aiError = null, modelUsed = null;
  if (AI) {
    const sys = await clinicContext(DB).then(systemPrompt);
    const order = workingModel
      ? [workingModel, ...MODEL_CANDIDATES.filter(m => m !== workingModel)]
      : MODEL_CANDIDATES;
    const payload = model => ({
      messages: [{ role: 'system', content: sys }, ...clean],
      max_tokens: 240,
      temperature: 0.35
    });
    for (const model of order) {
      try {
        if (wantStream) {
          const stream = await AI.run(model, { ...payload(model), stream: true });
          workingModel = model;
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Chat-Mode': 'ai',
              'X-Chat-Model': model
            }
          });
        }
        const res = await AI.run(model, payload(model));
        const out = (res && res.response || '').trim();
        if (out) { reply = out; workingModel = model; modelUsed = model; break; }
      } catch (e) {
        aiError = String(e && e.message || e).slice(0, 160);
      }
    }
  }
  if (!reply) {
    mode = 'fallback';
    reply = fallbackReply(clean[clean.length - 1].content, clinics.results, doctorsByClinic);
  }
  reply = reply.slice(0, 900);
  return json({ reply, mode, ...(modelUsed ? { model: modelUsed } : {}), ...(aiError && !modelUsed ? { ai_error: aiError } : {}) });
}
