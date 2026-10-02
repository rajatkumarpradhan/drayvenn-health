/* Drayvenn Assistant - floating support chat */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const history = JSON.parse(sessionStorage.getItem('dh_chat') || '[]');
  let open = false, busy = false, greeted = history.length > 0;

  const root = document.createElement('div');
  root.id = 'chat-root';
  root.innerHTML = `
    <button id="chat-fab" aria-label="Chat with Drayvenn Assistant">
      <span class="chat-fab-ring"></span>
      <svg id="chat-fab-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
    </button>
    <div id="chat-panel" class="hidden" role="dialog" aria-label="Drayvenn Assistant chat">
      <div id="chat-head">
        <div class="chat-head-avatar">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/></svg>
        </div>
        <div class="chat-head-text">
          <div class="chat-head-name">Drayvenn Assistant</div>
          <div class="chat-head-sub"><span class="chat-dot"></span>Here to help · 24x7</div>
        </div>
        <button id="chat-clear" aria-label="Clear chat" title="Clear chat"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg></button>
        <button id="chat-close" aria-label="Close chat">✕</button>
      </div>
      <div class="chat-disclaimer">Guidance only · not medical advice. Emergency: call 108 / 112</div>
      <div id="chat-confirm" class="chat-confirm hidden"><span>Clear this conversation?</span><button id="chat-clear-yes">Clear</button><button id="chat-clear-no">Keep</button></div>
      <div id="chat-ctx" class="chat-ctx"><i></i><span>Home</span></div>
      <div id="chat-msgs"></div>
      <div id="chat-chips"></div>
      <form id="chat-form">
        <input id="chat-input" placeholder="Symptoms ya sawaal likhein..." autocomplete="off" maxlength="500">
        <button type="submit" id="chat-send" aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3.4 20.4l17.4-7.5c.8-.35.8-1.45 0-1.8L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .72.73 1.2 1.39.91z"/></svg>
        </button>
      </form>
    </div>`;
  document.body.appendChild(root);

  const msgsEl = $('#chat-msgs'), chipsEl = $('#chat-chips');

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  function linkifyActions(container) {
    container.querySelectorAll('button[data-clinic]').forEach(b => {
      b.onclick = () => {
        toggle(false);
        if (window.openClinicFromChat) window.openClinicFromChat(b.dataset.clinic);
      };
    });
    container.querySelectorAll('button[data-trk]').forEach(b => { b.onclick = openTrackPrefilled; });
    container.querySelectorAll('button[data-loc]').forEach(b => { b.onclick = useLocation; });
    container.querySelectorAll('button[data-bookc]').forEach(b => { b.onclick = () => bookFromChat(b.dataset.bookc, b.dataset.bookd); });
    container.querySelectorAll('button[data-spec]').forEach(b => { b.onclick = () => runSpec(b.dataset.spec); });
    container.querySelectorAll('button[data-goto]').forEach(b => {
      b.onclick = () => {
        toggle(false);
        if (window.showFromChat) window.showFromChat(b.dataset.goto);
      };
    });
  }

  function renderText(t) {
    const btns = [];
    const ph = h => { btns.push(h); return '\u0001' + (btns.length - 1) + '\u0001'; };
    let text = String(t);
    text = text.replace(/\[\[clinic:([a-z0-9-]+)\]\]/gi, (m, id) => ph(`<button class="chat-action" data-clinic="${esc(id)}">View clinic \u2192</button>`));
    text = text.replace(/\[\[spec:([A-Za-z ]+)\]\]/g, (m, sp) => ph(`<button class="chat-action spec" data-spec="${esc(sp)}">Find ${esc(sp)} clinics</button>`));
    text = text.replace(/\[\[loc\]\]/g, () => ph('<button class="chat-action" data-loc="1">Use my location</button>'));
    text = text.replace(/\[\[book:([a-z0-9-]+):([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, cid, did, l) => ph(`<button class="chat-action spec" data-bookc="${esc(cid)}" data-bookd="${esc(did)}">${esc(l)}</button>`));
    text = text.replace(/\[\[trk\|([^\]]+)\]\]/g, (m, l) => ph(`<button class="chat-action" data-trk="1">${esc(l)}</button>`));
    text = text.replace(/\[\[ext:((?:https:\/\/wa\.me\/|mailto:)[^|\]]+)\|([^\]]+)\]\]/g, (m, u, l) => ph(`<a class="chat-action" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`));
    text = text.replace(/\[\[tel:([0-9+]+)\|([^\]]+)\]\]/g, (m, n, l) => ph(`<a class="chat-action" href="tel:${esc(n)}">${esc(l)}</a>`));
    text = text.replace(/\[\[go:([a-z]+)\|([^\]]+)\]\]/g, (m, v, l) => ph(`<button class="chat-action" data-goto="${esc(v)}">${esc(l)} \u2192</button>`));
    text = text.replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '');
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    let html = esc(text).replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|<br>)_([^<]+)_(?=<br>|$)/g, '$1<span class="chat-note">$2</span>');
    html = html.replace(/(?:\u0001\d+\u0001)+/g, m => '<div class="chat-acts">' + m.replace(/\u0001(\d+)\u0001/g, (x, n) => btns[+n]) + '</div>');
    html = html.replace(/(<br>)*(<div class="chat-acts">)/g, '$2');
    return html;
  }

  function addMsg(role, content, save = true) {
    const el = document.createElement('div');
    el.className = 'chat-msg ' + role;
    el.innerHTML = role === 'bot' ? renderText(content) : esc(maskPhone(content));
    msgsEl.appendChild(el);
    linkifyActions(el);
    scrollDown();
    const _el = el;
    if (save) {
      history.push({ role: role === 'bot' ? 'assistant' : 'user', content: role === 'bot' ? content : maskHist(content) });
      while (history.length > 20) history.shift();
      sessionStorage.setItem('dh_chat', JSON.stringify(history));
    }
    return _el;
  }

  function setChips(list) {
    chipsEl.innerHTML = list.map(c =>
      `<button class="chat-chip" data-q="${esc(c.q || '')}" ${c.goto ? `data-goto="${c.goto}"` : ''}>${esc(c.label)}</button>`).join('');
    chipsEl.querySelectorAll('.chat-chip').forEach(ch => {
      ch.onclick = () => {
        if (ch.dataset.goto) { toggle(false); if (window.showFromChat) window.showFromChat(ch.dataset.goto); return; }
        send(ch.dataset.q);
      };
    });
  }

  function typing(on) {
    $('#chat-typing')?.remove();
    if (on) {
      const el = document.createElement('div');
      el.className = 'chat-msg bot chat-typing';
      el.id = 'chat-typing';
      el.innerHTML = '<span></span><span></span><span></span>';
      msgsEl.appendChild(el);
      scrollDown();
    }
  }

  function saveTurn(role, content) {
    history.push({ role, content });
    while (history.length > 20) history.shift();
    sessionStorage.setItem('dh_chat', JSON.stringify(history));
  }

  // Streams the reply token by token into a live bubble; returns false if unsupported.
  async function sendStreaming() {
    const res = await fetch('/api/chat?stream=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-10) })
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('event-stream')) return false;
    typing(false);
    const el = document.createElement('div');
    el.className = 'chat-msg bot';
    msgsEl.appendChild(el);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          if (j.response) {
            full += j.response;
            el.textContent = full.replace(/\[\[[^\]]*\]\]/g, '').replace(/\[\[[^\]]*$/, '').replace(/\[$/, '');
            scrollDown();
          }
        } catch (e) { /* partial chunk */ }
      }
    }
    if (!full.trim()) { el.remove(); return false; }
    full = full.slice(0, 900);
    el.innerHTML = renderText(full);
    linkifyActions(el);
    scrollDown();
    saveTurn('assistant', full);
    return true;
  }

  /* ---------- local assistant: instant, private, no AI call, no patient data ---------- */
  const HI_WORDS = /\b(hai|hain|hu|hun|mujhe|mujhko|mera|meri|mere|ko|ka|ki|ke|kya|kaise|kaun|kab|kitna|nahi|nahin|nhi|bukhar|dard|chahiye|karna|karni|karo|batao|bataiye|dikhao|aap|kal|aaj|bacche|bachcha|dant|daant|khansi|sardi|kamar|ghutna|baal|khujli|sugar|pet|sar|sir|rahe|raha|rahi|se|mein|me|par|pe|liye|wala|wali|abhi|kar|karun|karu|karni|hindi|sakta|sakte|paisa|paise|kitne)\b/i;
  const isHi = t => (t.match(new RegExp(HI_WORDS.source, 'gi')) || []).length >= 2;
  const SPECS = [
    { spec: 'Paediatrics', re: /(paediatric|pediatric|child|children|kid|baby|infant|toddler|newborn|bacch|bache|bachh|shishu|vaccin|tika|teeka|immuni)/ },
    { spec: 'Dental', re: /(tooth|teeth|dant|daant|gum|cavity|toothache|dentist|jaw|wisdom|root canal|braces|filling|dental)/ },
    { spec: 'Dermatology', re: /(dermat|skin|rash|acne|pimple|itch|khujli|daane|daana|allerg|eczema|fungal|ringworm|dandruff|pigment|dark spot|hair|baal|jhad)/ },
    { spec: 'Orthopaedics', re: /(orthop|joint|knee|ghutn|back pain|kamar|backache|neck pain|gardan|shoulder|kandha|sprain|fracture|bone|haddi|ligament|sports|injur|chot|muscle pain|arthritis|heel|ankle|physio)/ },
    { spec: 'Diabetology', re: /(sugar|diabet|madhumeh|thyroid|insulin|hba1c)/ },
    { spec: 'General Medicine', re: /(general med|general phys|physician|fever|bukhar|cold|cough|khansi|khasi|sardi|zukam|flu|viral|throat|gala|sore|headache|sir dard|sar dard|migraine|body pain|badan|weakness|kamzori|thakan|fatigue|vomit|ulti|nausea|diarrh|loose motion|dast|stomach|pet dard|pet mein|acidity|gas|infection|bp|blood pressure|dizz|chakkar|check ?up|checkup)/ }
  ];
  const SPEC_NOTE = {
    'General Medicine': ['a General Physician', 'General Physician'],
    'Paediatrics': ['a Paediatrician (child specialist)', 'Bachchon ke doctor (Paediatrician)'],
    'Dental': ['a Dentist', 'Dentist'],
    'Dermatology': ['a Dermatologist (skin and hair)', 'Skin aur baal ke doctor (Dermatologist)'],
    'Orthopaedics': ['an Orthopaedic doctor (bones and joints)', 'Haddi aur jodon ke doctor (Orthopaedic)'],
    'Diabetology': ['a Diabetologist', 'Sugar ke doctor (Diabetologist)']
  };
  const EMERG = /(chest pain|seene (me|mein)|heart attack|dil ka daura|can.?t breathe|cannot breathe|breathless|breathing (problem|trouble|difficult)|saans (nahi|nhi|phool|lene)|unconscious|behosh|faint|seizure|fits|daura|stroke|lakwa|heavy bleeding|bahut khoon|khoon (nahi ruk|beh)|poison|overdose|suicid|marna chahta|marna chahti|accident|vomiting blood|blood in vomit|khoon ki ulti|slurred|face droop|paralys|throat closing|swelling of (the )?(face|throat)|seene (me|mein) (bhaari|dabav)|baby not (breathing|responding))/;
  const DISCLAIM = ['I can only guide you to the right kind of doctor. This is not a diagnosis or medical advice.', 'Main sirf sahi doctor tak pahunchne mein madad karta hun. Ye diagnosis ya medical salah nahi hai.'];

  const T = {
    greet: ['Hello, I am the Drayvenn assistant. Tell me your symptoms and I will point you to the right kind of doctor, or ask me anything about booking, fees, cancelling or tracking.', 'Namaste, main Drayvenn assistant hun. Apni takleef batayein, main sahi doctor suggest karunga. Booking, fees, cancel ya track ke bare mein bhi puchh sakte hain.'],
    thanks: ['You are welcome. Take care, and I am here if you need anything else.', 'Koi baat nahi. Apna khayal rakhiye, kuch aur chahiye to bata dijiye.'],
    book: ['Booking takes about a minute, step by step:\n1. Tap "Find a Clinic" and pick a clinic.\n2. Choose a doctor and tap "Book with this doctor".\n3. Pick a date and a time slot.\n4. Enter the patient name and mobile number, then verify the OTP.\n5. Confirm. You get a reference like DH-XXXXXXXXXX.\nThe clinic then confirms your slot. No online payment, you pay at the clinic.', 'Booking mein bas ek minute lagta hai:\n1. "Find a Clinic" dabake clinic chuniye.\n2. Doctor chuniye aur "Book with this doctor" dabaiye.\n3. Tareekh aur time slot chuniye.\n4. Patient ka naam aur mobile number dalkar OTP verify kijiye.\n5. Confirm kijiye. Aapko DH-XXXXXXXXXX jaisa reference milega.\nPhir clinic slot confirm karta hai. Online payment nahi, paise clinic mein dene hain.'],
    pay: ['There is no online payment. You pay the consultation fee at the clinic after your visit. The fee is shown on each doctor card before you book, so there are no surprises.', 'Online payment nahi hai. Consultation fee aap clinic mein visit ke baad dete hain. Fee har doctor card par booking se pehle dikhti hai.'],
    cancel: ['You can cancel a Pending booking yourself: open My Bookings (or Track Booking with your reference and mobile) and tap Cancel. Once the clinic has confirmed it, please call the clinic to cancel or change it. The number is on the clinic page.', 'Pending booking aap khud cancel kar sakte hain: My Bookings ya Track Booking (reference + mobile) kholkar Cancel dabaiye. Clinic ke confirm karne ke baad cancel ya change ke liye clinic ko call kijiye. Number clinic page par hai.'],
    resched: ['To change the time, open the booking in My Bookings and use Reschedule. A rescheduled booking goes back to Pending until the clinic confirms the new slot.', 'Time badalne ke liye My Bookings mein booking kholkar Reschedule dabaiye. Naya slot clinic confirm kare tab tak booking Pending rehti hai.'],
    track: ['To check a booking, tap Track Booking and enter your reference (like DH-XXXXXXXXXX) with the mobile number used to book. You will see whether it is Pending, Confirmed or Cancelled. Signed-in users can also see everything in My Bookings.', 'Booking dekhne ke liye Track Booking kholiye, apna reference (DH-XXXXXXXXXX) aur booking wala mobile number dalein. Status Pending, Confirmed ya Cancelled dikhega. Sign in karke My Bookings mein sab ek jagah dikhta hai.'],
    otp: ['To see all your bookings in one place, tap Profile and sign in with your mobile number. We send a one-time code (OTP) to verify it. Your details are used only for your booking.', 'Saari bookings ek jagah dekhne ke liye Profile mein mobile number se sign in kijiye. Verify karne ke liye OTP aata hai. Aapki details sirf booking ke liye use hoti hain.'],
    family: ['You can book for a family member. In the booking steps, add them as a family member (name and relation) and keep your own mobile number. Each booking gets its own reference.', 'Parivar ke kisi member ke liye bhi book kar sakte hain. Booking mein unhe family member ke roop mein jodein (naam aur rishta), mobile number apna rakhein. Har booking ka alag reference milta hai.'],
    time: ['Each clinic page shows its timings, doctors and live open slots. Tap Find a Clinic and open any clinic to see today\'s availability.', 'Har clinic page par timings, doctors aur live slots dikhte hain. Find a Clinic dabake koi bhi clinic kholiye.'],
    emerg: ['**Please go to the nearest hospital now.**\nThis could be an emergency. Call 108 or 112 right away, or ask someone to take you to the nearest emergency room. Do not wait for an appointment. I cannot assess this safely, only a doctor can.', '**Kripya abhi nazdiki hospital jaiye.**\nYe emergency ho sakti hai. Turant 108 ya 112 par call kijiye ya kisi ko saath lekar nazdiki emergency mein jaiye. Appointment ka intezaar mat kijiye. Main isse safely assess nahi kar sakta, sirf doctor kar sakta hai.'],
    support: ['You can reach the Drayvenn Lab team here. WhatsApp is the fastest. For anything detailed, email us and a real person will reply.\nPhone: +91 77355 21019\nEmail: hello@drayvennlab.in', 'Drayvenn Lab team se yahan baat kar sakte hain. WhatsApp sabse tez hai. Detail ke liye email kijiye, asli insaan jawab dega.\nPhone: +91 77355 21019\nEmail: hello@drayvennlab.in'],
    advice: ['I cannot advise on medicines, doses, treatment or what condition this might be. Only a doctor can do that safely. What I can do is point you to the right specialty and help you book.', 'Main dawai, dose, ilaaj ya bimari ke bare mein salah nahi de sakta. Ye sirf doctor safely bata sakta hai. Main sahi specialty batakar booking mein madad kar sakta hun.'],
    ask: ['Could you tell me a little more? For example, what you are feeling and for how long, or who the patient is (you, a child, a parent).', 'Thoda aur bataiye? Jaise kya takleef hai aur kab se, ya patient kaun hai (aap, bachcha, mata-pita).']
  };

  function localReply(raw) {
    const t = ' ' + raw.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s.?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const hi = (isHi(t) || mem.hi) ? 1 : 0;
    const L = k => T[k][hi];
    const has = re => re.test(t);
    if (has(EMERG)) return { text: L('emerg') + '\n[[tel:108|Call 108]][[tel:112|Call 112]]', urgent: true, chips: [{ label: 'I am okay now', q: 'I am okay now' }, { label: 'Find a doctor', q: 'Find me a clinic' }] };
    if (has(/(reschedul|change (the )?(time|date|slot)|time badal|date badal|slot badal|badalna|postpone)/)) return { text: L('resched') + '\n[[go:mybookings|Open My Bookings]]' };
    if (has(/(cancel|radd|raddh)/)) return { text: L('cancel') + '\n[[go:track|Track Booking]]' };
    if (has(/(track|status|reference|booking id|ref no|confirm hua|confirmed\?|meri booking|my booking)/)) return { text: L('track') + '\n[[go:track|Track Booking]]' };
    if (has(/(pay|payment|upi|card|fees?|charges?|cost|price|paisa|paise|kitna|kitne|rate)/)) return { text: L('pay') };
    if (has(/(otp|sign ?in|log ?in|login|account|profile|password)/)) return { text: L('otp') + '\n[[go:account|Open Profile]]' };
    if (has(/(symptom|health problem|not feeling well|feeling (sick|unwell|ill)|unwell|tabiyat|takleef|taklif|bimar|problem hai|another problem|something wrong|pain)/)) return { text: L('ask') };
    const found = SPECS.filter(s => s.re.test(t)).slice(0, 2);
    if (found.length) {
      const names = found.map(s => SPEC_NOTE[s.spec][hi]);
      const intro = hi ? `Aapki baat se lagta hai ki ${names.join(' ya ')} se milna theek rahega.` : `From what you describe, ${names.join(' or ')} would be a good place to start.`;
      const how = hi ? 'Neeche button se us specialty ke clinics dekhiye aur slot book kijiye.' : 'Use the button below to see clinics for that specialty and book a slot.';
      return { text: `${intro}\n${how}\n${found.map(s => `[[spec:${s.spec}]]`).join('')}\n_${DISCLAIM[hi]} Agar takleef badhe ya serious lage to turant 108/112 par call kijiye._`, symptom: true };
    }
    if (has(/(mother|father|mom|mum|papa|maa|mummy|wife|husband|family|parent|son|daughter|beta|beti|biwi|pati|someone else|for my)/)) return { text: L('family') };
    if (has(/(book|appointment|slot|booking|schedule|doctor se milna|milna hai|kaise kare|how (do|to|can))/)) return { text: L('book') + '\n[[go:clinics|Find a Clinic]]', steps: true };
    if (has(/(timing|hours|open|close|kab tak|kitne baje|available|availability|khula)/)) return { text: L('time') + '\n[[go:clinics|Find a Clinic]]' };
    if (has(/^ *(hi+|hello+|hey+|namaste|namaskar|hii+|good (morning|afternoon|evening)|start|help|menu)[ .?!]*$/)) return { text: L('greet') };
    if (has(/(thank|thanks|shukriya|dhanyavaad|dhanyawad|thx)/)) return { text: L('thanks') };
    return null;
  }

  function runSpec(spec) {
    toggle(false);
    if (window.showFromChat) window.showFromChat('clinics');
    setTimeout(() => {
      const si = document.getElementById('search-input');
      if (si) { si.value = spec; si.dispatchEvent(new Event('input', { bubbles: true })); }
    }, 350);
  }

  /* ---------- conversation memory (specialty, area, clinic, language only; never refs or mobiles) ---------- */
  const mem = Object.assign({ spec: null, area: null, clinicId: null, lastShown: [], hi: 0 }, (() => { try { return JSON.parse(sessionStorage.getItem('dh_mem') || '{}'); } catch (e) { return {}; } })());
  const saveMem = () => { try { sessionStorage.setItem('dh_mem', JSON.stringify({ spec: mem.spec, area: mem.area, clinicId: mem.clinicId, lastShown: mem.lastShown, hi: mem.hi })); } catch (e) {} };
  const PRON = /\b(that|this|its|their|wahan|wahi|wo|woh|ye|yeh|uski|uska|iski|iska|usme|isme|us clinic|is clinic|that clinic|this clinic)\b/;
  /* ---------- context awareness: reads page state from the app, never patient details ---------- */
  const trail = { clinicId: null, doctorId: null };
  function hookTrail() {
    try {
      const oc = window.openClinic, ob = window.openBooking;
      if (typeof oc === 'function' && !oc._dh) { window.openClinic = function (id) { trail.clinicId = id; mem.clinicId = id; saveMem(); return oc.apply(this, arguments); }; window.openClinic._dh = 1; }
      if (typeof ob === 'function' && !ob._dh) { window.openBooking = function (id) { trail.doctorId = id; return ob.apply(this, arguments); }; window.openBooking._dh = 1; }
    } catch (e) {}
  }
  const S = () => { try { return state; } catch (e) { return null; } };
  function ctx() {
    const st = S() || {};
    const vis = ['home','clinics','clinic','confirm','mybookings','track','signin','account','about','services','contact'].map(v => document.getElementById('view-' + v)).find(e => e && !e.classList.contains('hidden'));
    const view = vis ? vis.id.replace('view-', '') : 'home';
    const wiz = !!document.getElementById('wizard-overlay');
    const b = st.booking || {};
    let clinic = st.clinic || null;
    const here = wiz || view === 'clinic';
    if (!clinic && trail.clinicId && st.clinics) clinic = st.clinics.find(c => c.id === trail.clinicId) || null;
    let doctor = wiz ? b.doctor : null;
    return { view, wiz, here, clinic, doctor, step: b.step, date: b.date, slot: b.slot, st };
  }
  function ctxLabel(c) {
    if (c.wiz && c.doctor) return `Booking ${c.doctor.name} · step ${c.step === 'details' ? 2 : 1} of 2` + (c.date && c.slot ? ` · ${fmtDateShort(c.date)}, ${fmtTime(c.slot)}` : '');
    if (c.view === 'clinic' && c.clinic) return `Viewing ${c.clinic.name}`;
    if (c.view === 'clinics') { const q = c.st.filter && c.st.filter.q; return q ? `Searching "${q}"` : 'Browsing clinics'; }
    if (c.view === 'confirm') return 'Booking confirmed';
    if (c.view === 'track') return 'Track Booking';
    if (c.view === 'mybookings') return 'My Bookings';
    if (c.view === 'account') return 'Profile';
    return 'Home';
  }
  function ctxChips(c) {
    if (c.wiz && c.step === 'details') return [{ label: 'What do I enter?', q: 'What should I enter in the details?' }, { label: 'OTP not received', q: 'OTP nahi aaya' }, { label: 'Book for family', q: 'Can I book for my mother?' }, { label: 'Payment', q: 'How do I pay?' }];
    if (c.wiz) return [{ label: 'Show open slots', q: 'Show available slots' }, { label: 'No slot for my date', q: 'slot nahi mil raha' }, { label: 'What next?', q: 'What should I do next?' }, { label: 'Fees', q: 'What is the fee?' }];
    if (c.view === 'clinic' && c.clinic) return [{ label: 'Show open slots', q: 'Show available slots' }, { label: 'Doctors and fees', q: 'Which doctors are here and what are the fees?' }, { label: 'Help me book', q: 'Help me book' }, { label: 'Timings', q: 'What are the timings?' }];
    if (c.view === 'clinics') return [{ label: 'I have symptoms', q: 'I have a health problem' }, { label: 'Earliest slot', q: 'Which clinic has the earliest slot?' }, { label: 'Nearest clinic', q: 'Nearest clinic' }];
    return null;
  }
  const cap = s => String(s || '').slice(0, 60);
  const kmBetween = (a, b) => { const R = 6371, rad = x => x * Math.PI / 180; const dl = rad(b[0] - a[0]), dn = rad(b[1] - a[1]); const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const dKm = c => { try { const st = S(); if (st && st.geo && CLINIC_COORDS[c.id]) return kmBetween(st.geo, CLINIC_COORDS[c.id]); } catch (e) {} return null; };
  const nextTxt = n => { try { return fmtNext(n); } catch (e) { return null; } };
  const nextKey = n => n ? (n.date + 'T' + n.time) : '9999';
  const earliest = c => (c.doctors || []).map(d => d.next_available).filter(Boolean).sort((a, b) => nextKey(a) < nextKey(b) ? -1 : 1)[0] || null;

  function specClinics(spec) {
    const st = S(); const all = (st && st.clinics) || [];
    const stem = spec.toLowerCase().slice(0, 6);
    const hit = all.filter(c => (c.specialties || []).some(x => x.toLowerCase().startsWith(stem)) || (c.doctors || []).some(d => (d.specialty || '').toLowerCase().includes(stem.slice(0, 5))));
    hit.sort((a, b) => { const da = dKm(a), db = dKm(b); if (da != null && db != null) return da - db; return nextKey(earliest(a)) < nextKey(earliest(b)) ? -1 : 1; });
    return hit;
  }
  function docFor(c, spec) {
    const stem = spec.toLowerCase().slice(0, 5);
    const ds = (c.doctors || []).filter(d => (d.specialty || '').toLowerCase().includes(stem) || spec === 'General Medicine' && /general/i.test(d.specialty || ''));
    const pool = ds.length ? ds : (c.doctors || []);
    return pool.slice().sort((a, b) => nextKey(a.next_available) < nextKey(b.next_available) ? -1 : 1)[0] || null;
  }
  function clinicLines(list, spec, hi) {
    return list.slice(0, 3).map(c => {
      const d = docFor(c, spec), km = dKm(c), nx = d && nextTxt(d.next_available);
      const line = `**${c.name}**, ${c.area}` + (km != null ? ` (${km.toFixed(1)} km)` : '') + (d ? `\n${d.name}, Rs${d.fee}` + (nx ? (hi ? `, agla slot ${nx}` : `, next slot ${nx}`) : (hi ? ', abhi slot nahi' : ', no open slot right now')) : '');
      return line + `\n[[clinic:${c.id}]]` + (d && nx ? `[[book:${c.id}:${d.id}|${hi ? 'Book' : 'Book'} ${d.name.replace(/^Dr\.? /, 'Dr ')}]]` : '');
    }).join('\n\n');
  }

  async function slotsFor(docId, date) {
    try { const r = await api('/api/slots?doctor_id=' + encodeURIComponent(docId) + '&date=' + date); return (r.slots || []).filter(x => x.available).map(x => x.time); } catch (e) { return null; }
  }
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
  async function weekSlots(docId, n = 7) {
    const out = [];
    const res = await Promise.all(Array.from({ length: n }, (_, i) => slotsFor(docId, addDays(i))));
    res.forEach((s, i) => { if (s && s.length) out.push({ date: addDays(i), times: s }); });
    return out;
  }
  const timesTxt = ts => ts.slice(0, 4).map(fmtTime).join(', ') + (ts.length > 4 ? ` +${ts.length - 4} more` : '');

  let lastSpec = null;
  async function smartReplyBase(raw) {
    let c = ctx();
    const t = ' ' + raw.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s.?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const hi = (isHi(t) || mem.hi) ? 1 : 0;
    const has = re => re.test(t);
    const st = c.st;
    if (has(EMERG)) return localReply(raw);
    if (!c.here && mem.clinicId && has(PRON) && st.clinics) { const fc = st.clinics.find(x => x.id === mem.clinicId); if (fc) c = Object.assign({}, c, { clinic: fc, here: true }); }
    // slot availability
    if (has(/(nahi mil|nhi mil|not (showing|available|finding|able)|no slots?|slots? (nahi|nhi|available|dikha|show|khali|full|kab|list)|show (me )?(the )?(open |available )?slots|available slots|open slots|next available|earliest|jaldi|kab milega|slots? (are )?(full|booked)|fully booked|time nahi)/)) {
      const target = c.wiz && c.doctor ? [c.doctor] : (c.clinic ? (c.clinic.doctors || []) : []);
      if (!target.length) {
        const all = ((st && st.clinics) || []).slice().sort((a, b) => nextKey(earliest(a)) < nextKey(earliest(b)) ? -1 : 1).filter(x => earliest(x)).slice(0, 3);
        if (!all.length) return { text: hi ? 'Abhi koi open slot nahi dikh raha. Kuch der baad dekhiye ya clinic ko call kijiye.' : 'I do not see an open slot right now. Please check again later or call the clinic.' };
        return { text: (hi ? 'Sabse jaldi ke slots:' : 'Earliest open slots right now:') + '\n\n' + all.map(x => `**${x.name}**\n${nextTxt(earliest(x))}\n[[clinic:${x.id}]]`).join('\n\n') + (hi ? '\n\nKisi clinic ka naam batayein to main uske doctors ke slots dikha dunga.' : '\n\nTell me a clinic and I will show its doctors\' slots.') };
      }
      const blocks = [];
      for (const d of target.slice(0, 3)) {
        const wk = await weekSlots(d.id);
        if (!wk.length) { blocks.push(`**${d.name}**\n` + (hi ? 'Agle 7 din koi slot khali nahi.' : 'No open slots in the next 7 days.')); continue; }
        blocks.push(`**${d.name}**\n` + wk.slice(0, 3).map(w => `${fmtDateShort(w.date)}: ${timesTxt(w.times)}`).join('\n'));
      }
      const head = c.clinic ? (hi ? `${c.clinic.name} ke open slots:` : `Open slots at ${c.clinic.name}:`) : '';
      let extra = '';
      if (c.wiz && c.doctor && c.date) {
        const here = await slotsFor(c.doctor.id, c.date);
        if (here && !here.length) extra = '\n\n' + (hi ? `${fmtDateShort(c.date)} ko is doctor ka koi slot khali nahi hai. Upar wale din chuniye.` : `${fmtDateShort(c.date)} has no open slot for this doctor. Pick one of the days above.`);
      }
      const jump = (c.wiz && c.doctor) ? '' : (c.clinic ? `\n[[clinic:${c.clinic.id}]]` : '');
      return { text: head + (head ? '\n\n' : '') + blocks.join('\n\n') + extra + jump };
    }
    // booking flow help (in wizard)
    if (c.wiz && c.doctor) {
      if (has(/(otp)/)) return { text: hi ? 'OTP aane mein ek minute lag sakta hai. Mobile number sahi hai ya nahi dekhiye, phir naya code mangwaiye. Phir bhi na aaye to clinic ko call kijiye.' : 'The code can take up to a minute. Check the mobile number is right, then request a new code. If it still does not arrive, call the clinic.' };
      if (has(/(enter|details|name|naam|number|mobile|dalna|what next|next|kya karu|ab kya|aage|help|stuck|confus|samajh|continue|how|kaise)/)) {
        if (c.step === 'details') return { text: hi ? `Ab patient ka naam aur 10 digit ka mobile number dalein. Phir OTP verify karke Confirm dabaiye. Aapka slot: ${c.date ? fmtDateShort(c.date) : ''} ${c.slot ? fmtTime(c.slot) : ''} (${c.doctor.name}). Fee Rs${c.doctor.fee}, clinic mein dena hai.` : `Now enter the patient's name and a 10 digit mobile number, then verify the OTP and tap Confirm. Your slot: ${c.date ? fmtDateShort(c.date) : ''} ${c.slot ? fmtTime(c.slot) : ''} with ${c.doctor.name}. The fee is Rs${c.doctor.fee}, paid at the clinic.` };
        if (!c.date) return { text: hi ? `${c.doctor.name} ke saath booking chal rahi hai. Pehle ek tareekh chuniye, phir time slot. Fir "Continue" dabaiye.` : `You are booking with ${c.doctor.name}. First pick a date, then a time slot, then tap Continue.` };
        if (!c.slot) return { text: hi ? `${fmtDateShort(c.date)} chuna hai. Ab neeche se ek time slot chuniye, phir Continue.` : `You picked ${fmtDateShort(c.date)}. Now choose a time slot below, then tap Continue.` };
        return { text: hi ? `Slot ${fmtDateShort(c.date)}, ${fmtTime(c.slot)} chuna hai. Continue dabake naam aur mobile number dalein.` : `You picked ${fmtDateShort(c.date)}, ${fmtTime(c.slot)}. Tap Continue and enter the patient's name and mobile number.` };
      }
      if (has(/(fee|charge|cost|price|kitna|kitne|paisa|paise)/)) return { text: (hi ? `${c.doctor.name} ki fee Rs${c.doctor.fee} hai. Online payment nahi, clinic mein dena hai.` : `${c.doctor.name}'s fee is Rs${c.doctor.fee}. No online payment, you pay at the clinic.`) };
    }
    // clinic-page questions
    if (c.clinic && c.here) {
      const cl = c.clinic;
      if (has(/(fee|charge|cost|price|kitna|kitne|doctors?|dr |who|kaun|specialist)/)) {
        const lines = (cl.doctors || []).map(d => `**${d.name}**, ${d.specialty}\nRs${d.fee}` + (d.next_available ? `, ${hi ? 'agla slot' : 'next slot'} ${nextTxt(d.next_available)}` : '')).join('\n\n');
        return { text: (hi ? `${cl.name} ke doctors:` : `Doctors at ${cl.name}:`) + '\n\n' + lines + '\n\n' + (hi ? 'Fee clinic mein dete hain.' : 'Fees are paid at the clinic.') };
      }
      if (has(/(timing|hours|open|close|kab tak|kitne baje|khula|address|phone|call|number|where|kahan)/)) return { text: `${cl.name}\n${cl.timings}\n${cl.address}\n${hi ? 'Phone' : 'Phone'}: ${cl.phone}` };
      if (has(/(book|appointment|help me)/) && !has(/(how|kaise|steps?)/)) {
        const d = (cl.doctors || []).slice().sort((a, b) => nextKey(a.next_available) < nextKey(b.next_available) ? -1 : 1).find(x => x.next_available);
        if (d) return { text: (hi ? `${cl.name} par aap hain. Sabse jaldi ${d.name} available hain (${nextTxt(d.next_available)}). Neeche button se booking shuru kijiye.` : `You are on ${cl.name}. The earliest doctor is ${d.name} (${nextTxt(d.next_available)}). Tap below to start booking.`) + `\n[[book:${cl.id}:${d.id}|Book ${d.name.replace(/^Dr\.? /, 'Dr ')}]]` };
      }
    }
    // nearest / location
    if (has(/(nearest|near me|nearby|paas|najdik|nazdik|closest)/) && !SPECS.some(s => s.re.test(t))) {
      const all = ((st && st.clinics) || []).slice().sort((a, b) => { const da = dKm(a), db = dKm(b); if (da != null && db != null) return da - db; return nextKey(earliest(a)) < nextKey(earliest(b)) ? -1 : 1; }).slice(0, 3);
      if (!st.geo) return { text: (hi ? 'Sabse paas ka clinic dikhane ke liye mujhe aapki location chahiye. Ye sirf aapke phone mein rehti hai, kahin save nahi hoti.' : 'To show the nearest clinic I need your location. It stays on your phone and is not saved anywhere.') + '\n[[loc]]' };
      return { text: (hi ? 'Aapke sabse paas ke clinics:' : 'Clinics closest to you:') + '\n\n' + all.map(x => `**${x.name}**, ${x.area} (${(dKm(x) || 0).toFixed(1)} km)\n[[clinic:${x.id}]]`).join('\n\n') };
    }
    // symptoms with real clinics
    const found = SPECS.filter(s => s.re.test(t)).slice(0, 2);
    if (found.length && !has(/(cancel|track|status|otp|sign ?in|login|pay|payment)/)) {
      lastSpec = found[0].spec;
      mem.spec = found[0].spec;
      const names = found.map(s => SPEC_NOTE[s.spec][hi]);
      const ar = mem.area;
      const intro = hi ? `Aapki baat se lagta hai ki ${names.join(' ya ')} se milna theek rahega.` : `${pick(['From what you describe,', 'Thanks for sharing that,'])} ${names.join(' or ')} would be a good place to start.`;
      let body = '';
      let shown = [];
      for (const s of found) {
        const all = specClinics(s.spec);
        if (!all.length) continue;
        const inA = ar ? all.filter(x => (x.area || '').toLowerCase() === ar.toLowerCase()) : [];
        const list = inA.length ? inA : all;
        const loc = inA.length ? (hi ? `${ar} mein` : `In ${ar}`) : st.geo ? (hi ? 'Aapke paas ke' : 'Closest to you') : (hi ? 'Sabse jaldi slot wale' : 'Earliest availability');
        body += `\n\n${loc} (${s.spec}):\n\n` + clinicLines(list.slice(0, ar ? 3 : 2), s.spec, hi);
        if (!shown.length) shown = list.slice(0, ar ? 3 : 2).map(x => x.id);
      }
      mem.lastShown = shown; saveMem();
      const here = c.clinic && c.here && found.some(s => specClinics(s.spec).some(x => x.id === c.clinic.id));
      const hereNote = here ? '\n\n' + (hi ? `Aap jo clinic dekh rahe hain (${c.clinic.name}) wo bhi is ke liye theek hai.` : `The clinic you are viewing (${c.clinic.name}) also fits this.`) : '';
      const ask = ar ? '' : '\n\n' + (hi ? 'Kis area mein chahiye? Bataiye, main wahin ke clinics dikha dunga.' : 'Which area suits you? Tell me and I will narrow it down.');
      const locBtn = st.geo || ar ? '' : '\n[[loc]]';
      const chips = ar ? [{ label: 'How do I book?', q: 'How do I book an appointment?' }, { label: 'Fees / payment', q: 'How do I pay?' }, { label: 'Another symptom', q: 'I have another problem' }] : [...areas().slice(0, 4).map(x => ({ label: x, q: x })), { label: 'Any area', q: 'Any area' }];
      return { text: `${intro}${body}${hereNote}${ask}${locBtn}\n_${DISCLAIM[hi]} Agar takleef badhe ya serious lage to turant 108/112 par call kijiye._`, symptom: true, chips };
    }
    return localReply(raw);
  }

  /* ---------- step 3: booking assistant + status helper (reference AND mobile required) ---------- */
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const CLOSER = { en: ['Take care.', 'Hope you feel better soon.', 'Feel better soon.'], hi: ['Apna khayal rakhiye.', 'Jaldi theek ho jayein.'] };
  const SPEC_NAMES = ['General Medicine', 'Paediatrics', 'Dental', 'Dermatology', 'Orthopaedics', 'Diabetology'];
  let flow = null;            // booking assistant: { spec, area }
  let sflow = null;           // status helper: { ref, await }
  let creds = null;           // in memory only, cleared after use
  const maskPhone = s => String(s).replace(/(^|\D)([6-9]\d)\d{5}(\d{3})(?!\d)/g, '$1$2•••••$3');
  const maskHist = s => maskPhone(s).replace(/\bDH[-\s][A-Z0-9]{5,12}\b/gi, 'DH-••••');
  const getRef = s => { const m = String(s).match(/\bDH[-\s]([A-Z0-9]{5,12})\b/i); return m ? 'DH-' + m[1].toUpperCase() : null; };
  const getPhone = s => { const m = String(s).replace(/[\s-]/g, '').match(/(?:^|\D)(?:\+?91)?([6-9]\d{9})(?!\d)/); return m ? m[1] : null; };
  const areas = () => { const st = S(); return [...new Set(((st && st.clinics) || []).map(c => c.area).filter(Boolean))]; };

  async function statusLookup(ref, phone, hi) {
    sflow = null;
    let b;
    try {
      const r = await api(`/api/bookings/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone)}`);
      b = r.booking;
    } catch (e) {
      if (e && e.status === 404) return { text: hi ? 'Is reference aur mobile number se koi booking nahi mili. Dono dobara check kijiye (reference DH-XXXXXXXXXX jaisa hota hai, mobile wahi jo booking mein diya tha).' : 'I could not find a booking with that reference and mobile number. Please check both. The reference looks like DH-XXXXXXXXXX and the mobile is the one used while booking.', keep: true, chips: [{ label: 'Try again', q: 'Check my booking status' }, { label: 'Open Track Booking', goto: 'track' }] };
      return { text: hi ? 'Abhi status check nahi ho paya. Thodi der baad try kijiye ya Track Booking use kijiye.' : 'I could not check that right now. Please try again in a moment or use Track Booking.', keep: true, chips: [{ label: 'Open Track Booking', goto: 'track' }] };
    }
    creds = { ref, phone, t: Date.now() };
    let ds = b.status; try { ds = dispStatus(b) || b.status; } catch (e) {}
    const label = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed', expired: 'Expired' }[ds] || ds;
    const upcoming = b.status !== 'cancelled' && b.date >= toISODate(new Date());
    let head = `**${ref}** is **${label}**.\n${b.doctor_name}, ${b.clinic_name} (${b.clinic_area})\n${fmtDateShort(b.date)}, ${fmtTime(b.slot)}`;
    let tail = '';
    if (b.status === 'pending' && upcoming) tail = hi ? '\nClinic abhi confirm karega. Chahein to yahin se cancel ya reschedule kar sakte hain.\n[[trk|Cancel in Track Booking]][[go:mybookings|Reschedule]]' : '\nThe clinic will confirm it soon. You can cancel or reschedule if your plans changed.\n[[trk|Cancel in Track Booking]][[go:mybookings|Reschedule]]';
    else if (b.status === 'confirmed' && upcoming) tail = (hi ? '\nBooking confirm hai. Cancel ya time badalne ke liye clinic ko call kijiye.' : '\nIt is confirmed. To cancel or change the time, please call the clinic.') + (b.clinic_phone ? `\n[[tel:${b.clinic_phone}|Call clinic]]` : '') + '[[go:mybookings|Reschedule]]';
    else if (b.status === 'cancelled') tail = (hi ? '\nYe booking cancel ho chuki hai. Nayi booking karein?' : '\nThis booking is cancelled. Want to book again?') + '\n[[go:clinics|Find a clinic]]';
    else tail = (hi ? '\nYe visit ho chuki hai ya time nikal gaya. Dobara book karein?' : '\nThis visit is in the past. Want to book again?') + '\n[[go:clinics|Find a clinic]]';
    return { text: head + tail, status: true, save: false, chips: [{ label: 'Another booking', q: 'Check another booking' }, { label: 'Thanks', q: 'thanks' }] };
  }

  function openTrackPrefilled() {
    if (!creds) { toggle(false); if (window.showFromChat) window.showFromChat('track'); return; }
    const { ref, phone } = creds; creds = null;
    toggle(false);
    show('track');
    try { $('#bk-ref').value = ref; $('#bk-phone').value = phone; lookupBooking(); } catch (e) {}
  }

  async function smartReply(raw) {
    const c = ctx();
    const t = ' ' + raw.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s.?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    if (isHi(t)) mem.hi = 1; else if (t.trim().split(' ').length >= 4) mem.hi = 0;
    const hi = mem.hi ? 1 : 0;
    const has = re => re.test(t);
    const L2 = k => T[k][hi];
    if (has(EMERG)) { flow = null; sflow = null; return smartReplyBase(raw); }
    const ADVICE = /(medicine|medication|dawai|dawa\b|tablet|syrup|dose|dosage|goli|paracetamol|ibuprofen|antibiotic|crocin|dolo|what (should|can) i (take|eat|do|use)|kya (khaun|khana|lun|karun|lena)|home remed|gharelu|nuskha|treatment|ilaaj|\bcure\b|is it (serious|dangerous|cancer)|kya (hua|ye) hai mujhe|diagnos|what (disease|illness|condition)|kaun si bimari|how (to|do i) (treat|cure|reduce)|side effect|prescri)/;
    if (has(ADVICE) && !has(/(cancel|track|status|fee|pay|refund)/)) {
      const rr = await smartReplyBase(raw);
      const head = L2('advice');
      if (rr && rr.symptom) { rr.text = head + '\n\n' + rr.text; return rr; }
      return { text: head, chips: [{ label: 'Describe symptoms', q: 'I have a health problem' }, { label: 'Book appointment', q: 'I want to book an appointment' }, { label: 'Talk to support', q: 'Talk to support' }] };
    }
    if (has(/(support|help ?desk|customer care|human|real person|insaan|talk to (someone|a person|you)|speak to|complain|shikayat|contact (you|us)|your (number|email)|whatsapp)/) && !has(/(clinic|doctor)/)) return { text: L2('support') + '\n[[ext:https://wa.me/917735521019?text=Hi%20Drayvenn%20Lab|WhatsApp us]][[tel:+917735521019|Call]][[ext:mailto:hello@drayvennlab.in|Email]]', chips: DEFAULT_CHIPS };
    if (/^ *(i am okay now|i m okay now|main theek hun|theek hun)/.test(t)) return { text: hi ? 'Accha hua. Apna khayal rakhiye. Chahein to main doctor se milne ki booking mein madad kar dun.' : 'Glad to hear it. Please do see a doctor soon if anything feels off. I can help you book one.', chips: DEFAULT_CHIPS };
    const ref = getRef(raw), phone = getPhone(raw);
    // status helper
    if (ref && phone) return statusLookup(ref, phone, hi);
    if (ref && !phone) { sflow = { ref, await: 'mobile' }; return { text: hi ? `Dhanyavaad. Aapki privacy ke liye mujhe booking wala 10 digit mobile number bhi chahiye. Dono match hone par hi details dikhata hun.` : `Thanks. For your privacy I also need the 10 digit mobile number used for this booking. I only show details when both match.`, keep: true }; }
    if (sflow && sflow.await === 'mobile' && phone) return statusLookup(sflow.ref, phone, hi);
    if (phone && !ref && sflow && sflow.await === 'ref') { sflow.phone = phone; return { text: hi ? 'Ab booking reference batayein (DH-XXXXXXXXXX jaisa).' : 'Now type the booking reference (looks like DH-XXXXXXXXXX).', keep: true }; }
    if (has(/(status|check (my|the|another) booking|another booking|meri booking|my booking|booking (ka )?(status|check)|confirm hua|confirmed (hai|ho)|track my)/) && !has(/(how|kaise)/)) {
      sflow = { await: 'ref' };
      return { text: hi ? 'Zaroor. Apna booking reference (DH-XXXXXXXXXX) aur booking wala mobile number bhejiye. Dono match honge tabhi details dikhaunga.' : 'Sure. Send me your booking reference (DH-XXXXXXXXXX) and the mobile number used for it. I only show details when both match.', keep: true, chips: [{ label: 'Open Track Booking', goto: 'track' }, { label: 'Where is my reference?', q: 'Where do I find my booking reference?' }] };
    }
    if (has(/(where|kahan).*(reference|ref)|reference (kahan|where)/)) return { text: hi ? 'Reference booking confirm hone ke baad screen par dikhta hai (DH-XXXXXXXXXX) aur aapki My Bookings list mein bhi hota hai.' : 'Your reference (DH-XXXXXXXXXX) is shown right after you book and is also listed in My Bookings.', keep: sflow ? true : false };
    // booking assistant
    const specNow = () => { const f = SPECS.find(s => s.re.test(t)); if (f) return f.spec; const n = SPEC_NAMES.find(x => t.includes(' ' + x.toLowerCase() + ' ')); return n || null; };
    const areaNow = () => { if (has(/(any area|anywhere|kahin bhi|koi bhi area|all areas|kisi bhi)/) || /^ *any *$/.test(t)) return 'Any'; return areas().find(a => t.includes(a.toLowerCase())) || null; };
    const askSpec = () => ({ text: flow && flow.area && flow.area !== 'Any' ? (hi ? `${flow.area}, theek hai. Kis tarah ke doctor chahiye?` : `${flow.area}, got it. What kind of doctor do you need?`) : (hi ? 'Zaroor, sahi clinic dhoondhne mein madad karta hun. Kis tarah ke doctor chahiye?' : 'Happy to help you find the right clinic. What kind of doctor do you need?'), keep: true, chips: [...SPEC_NAMES.map(x => ({ label: x, q: x })), { label: 'Not sure', q: 'Not sure' }] });
    const askArea = () => ({ text: hi ? `${flow.spec} theek hai. Kis area mein chahiye?` : `${flow.spec}, got it. Which area works for you?`, keep: true, chips: [...areas().map(x => ({ label: x, q: x })), { label: 'Any area', q: 'Any area' }] });
    const words = t.trim().split(' ').length;
    const sp0 = specNow(), ar0 = areaNow();
    if (/^ *(reset|start over|new chat|naya chat|fresh start)/.test(t)) { mem.spec = mem.area = mem.clinicId = null; mem.lastShown = []; flow = null; sflow = null; saveMem(); return { text: hi ? 'Theek hai, naye sire se shuru karte hain. Kaise madad karun?' : 'Fresh start. How can I help?', chips: DEFAULT_CHIPS }; }
    if (ar0 && ar0 !== 'Any') mem.area = ar0;
    if (sp0) mem.spec = sp0;
    saveMem();
    if (!c.wiz) {
      const ord = has(/(pehla|pehle wala|first( one)?|1st)/) ? 0 : has(/(dusra|doosra|second( one)?|2nd)/) ? 1 : has(/(teesra|third( one)?|3rd)/) ? 2 : -1;
      if (ord >= 0 && words <= 7 && mem.lastShown[ord]) {
        const cl = ((S() || {}).clinics || []).find(x => x.id === mem.lastShown[ord]);
        if (cl) { mem.clinicId = cl.id; saveMem(); return { text: (hi ? `${cl.name} ke baare mein:` : `${pick(['Great choice.', 'Sure.'])} About ${cl.name}:`) + '\n\n' + clinicLines([cl], mem.spec || '', hi) + '\n' + (hi ? `Timings: ${cl.timings}` : `Timings: ${cl.timings}`), chips: [{ label: 'Open slots', q: 'Show available slots' }, { label: 'Doctors and fees', q: 'Doctors and fees' }, { label: 'Another area', q: 'Another area' }] }; }
      }
      if (mem.lastShown.length && has(/(earliest|jaldi|sabse pehle)/) && words <= 8) {
        const cls = mem.lastShown.map(id => ((S() || {}).clinics || []).find(x => x.id === id)).filter(Boolean).sort((a, b) => nextKey(earliest(a)) < nextKey(earliest(b)) ? -1 : 1);
        if (cls.length) { const cl = cls[0]; mem.clinicId = cl.id; saveMem(); return { text: (hi ? `Sabse jaldi slot: ${cl.name}, ${nextTxt(earliest(cl))}.` : `Earliest of those is ${cl.name}, ${nextTxt(earliest(cl))}.`) + '\n' + clinicLines([cl], mem.spec || '', hi) }; }
      }
      if (/^ *another area *$/.test(t) && mem.spec) { flow = { spec: mem.spec, area: null }; mem.area = null; saveMem(); return askArea(); }
      if (mem.spec && !flow) {
        const affirm = /^ *(haan|han|ha|yes|yeah|yep|ok|okay|sure|theek hai|thik hai|dikhao|show me|show|please|ji|haan ji|ji haan|haan dikhao|yes please)[ .?]*$/.test(t);
        if (affirm) return showClinics(mem.spec, mem.area, hi);
        if (ar0 && !sp0 && words <= 8 && !has(/(slot|fee|timing|doctor|cancel|status|pay)/)) return showClinics(mem.spec, ar0 === 'Any' ? 'Any' : ar0, hi);
      }
      if (!mem.spec && ar0 && ar0 !== 'Any' && !sp0 && !flow && words <= 4) { flow = { spec: null, area: ar0 }; return askSpec(); }
    }
    if (flow) {
      if (has(/(not sure|pata nahi|don.?t know|nahi pata|confused)/)) { flow = null; return { text: hi ? 'Koi baat nahi. Bataiye kya takleef hai (jaise bukhar, dant dard, kamar dard), main sahi doctor suggest karunga.' : 'No problem. Tell me what you are feeling (for example fever, tooth pain, back pain) and I will suggest the right doctor.', chips: [{ label: 'Fever or cold', q: 'I have fever and cold' }, { label: 'Tooth pain', q: 'tooth pain' }, { label: 'Skin issue', q: 'skin rash' }, { label: 'Back or joint pain', q: 'back pain' }] }; }
      const sp = sp0, ar = ar0;
      if (sp) flow.spec = sp;
      if (ar) flow.area = ar;
      if (sp || ar) {
        if (!flow.spec) return askSpec();
        if (!flow.area) return askArea();
        const { spec, area } = flow; flow = null;
        return showClinics(spec, area, hi);
      }
      flow = null;
    }
    const startAssist = has(/(find (me )?(a )?(clinic|doctor)|clinic (chahiye|dhoondh|suggest)|doctor (chahiye|dhoondh|suggest)|suggest (a )?(clinic|doctor)|i want to book|book (an )?appointment|appointment (book|chahiye|lena)|doctor dikhao|book karna|booking karni)/) && !has(/(how|kaise|steps?|process|guide)/) && !c.wiz && !(c.clinic && c.here);
    if (startAssist) {
      flow = { spec: sp0 || mem.spec || null, area: ar0 || mem.area || null };
      if (!flow.spec) return askSpec();
      if (!flow.area) return askArea();
      { const { spec, area } = flow; flow = null; return showClinics(spec, area, hi); }
    }
    sflow = null;
    const r = await smartReplyBase(raw);
    if (r && r.symptom && !has(/(severe|bahut (zyada|tez)|unbearable|worst|teen din|3 days|since (days|many)|week|hafte|not (improving|getting better)|badh raha)/)) r.text = r.text.replace(/\n_/, '\n' + pick(CLOSER[hi ? 'hi' : 'en']) + '\n_');
    if (r && r.symptom && has(/(severe|bahut (zyada|tez)|unbearable|worst|teen din|3 days|week|hafte|not (improving|getting better)|badh raha)/)) r.text = r.text.replace(/\n_/, '\n' + (hi ? 'Takleef tez ya lambi chal rahi hai, isliye sabse jaldi wala slot book kijiye, intezaar mat kijiye.' : 'Since this is severe or has lasted, please book the earliest slot rather than waiting.') + '\n_');
    return r;
  }

  function showClinics(spec, area, hi, how) {
    const all = specClinics(spec);
    const any = !area || area === 'Any';
    const inArea = any ? all : all.filter(x => (x.area || '').toLowerCase() === area.toLowerCase());
    const list = inArea.length ? inArea : all;
    mem.spec = spec; mem.area = any ? null : area;
    if (!list.length) return { text: hi ? 'Abhi is specialty ka clinic nahi mila. Aap clinics list dekh sakte hain.' : 'I could not find a clinic for that specialty yet. You can browse the full list.', chips: DEFAULT_CHIPS };
    mem.lastShown = list.slice(0, 3).map(x => x.id); mem.clinicId = list.length === 1 ? list[0].id : mem.clinicId; saveMem();
    const lead = inArea.length ? (hi ? `${any ? spec + ' ke liye ye clinics' : area + ' mein ' + spec + ' ke clinics'}:` : `${pick(['Here are', 'Sure, here are'])} the ${spec} clinics${any ? '' : ' in ' + area}:`) : (hi ? `${area} mein ${spec} ka clinic nahi mila, par ye paas ke options hain:` : `No ${spec} clinic in ${area} yet, but these are close options:`);
    return { text: lead + '\n\n' + clinicLines(list, spec, hi) + '\n\n' + (hi ? 'Book dabaiye, time chuniye, naam aur mobile dalkar OTP verify karke confirm kijiye.' : 'Tap Book, pick a time, enter the name and mobile, verify the OTP and confirm.'), chips: [{ label: 'Another area', q: 'Another area' }, { label: 'Earliest slot', q: 'Which one has the earliest slot?' }, { label: 'How booking works', q: 'How do I book an appointment?' }] };
  }

  function useLocation() {
    if (!navigator.geolocation) { addMsg('bot', 'Your browser does not allow location. You can still pick a clinic from the list.'); return; }
    navigator.geolocation.getCurrentPosition(p => {
      try { state.geo = [p.coords.latitude, p.coords.longitude]; } catch (e) {}
      addMsg('bot', 'Thanks, using your location for this chat only.');
      send(lastSpec ? 'I need ' + lastSpec : 'nearest clinic');
    }, () => addMsg('bot', 'No problem, I could not get your location. You can still pick a clinic from the list.'), { timeout: 8000 });
  }
  function bookFromChat(cid, did) {
    toggle(false);
    Promise.resolve(window.openClinic(cid)).then(() => { try { openBooking(did); } catch (e) {} });
  }
  function refreshCtx() {
    const el = $('#chat-ctx'); if (!el) return;
    const c = ctx(); el.querySelector('span').textContent = ctxLabel(c);
  }

  const UNSAFE = /(\b\d+\s?(mg|ml|mcg|tablets?|capsules?)\b|\b(tablet|capsule|syrup|paracetamol|ibuprofen|acetaminophen|aspirin|antibiotics?|amoxicillin|azithromycin|crocin|dolo|dosage|dose|ointment|cream)\b|\b(take|have|drink|eat|apply|use) (one|two|a|an|some|plenty|warm|cold|\d)|home remed|you (probably|likely|may|might) have|this (is|looks like|could be|may be|might be) (a |an )?(viral|infection|flu|cold|allergy|migraine|gastritis|diabetes|asthma))/i;
  function safeAI(r) {
    const t = String(r || '').trim();
    if (!t) return 'Sorry, I did not catch that. I can help you pick a specialty, book, track or cancel an appointment.';
    if (UNSAFE.test(t)) return 'I can only guide you to the right kind of doctor, I cannot give medical advice. Tell me what you are feeling and I will suggest a specialty and clinics, or ask me about booking.';
    return t.slice(0, 700);
  }
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    $('#chat-send').disabled = true;
    addMsg('user', text);
    $('#chat-input').value = '';
    typing(true);
    const lr = await smartReply(text);
    if (lr) {
      await new Promise(r => setTimeout(r, 450 + Math.min(500, lr.text.length * 2)));
      typing(false);
      const be = addMsg('bot', lr.text, lr.save !== false);
      if (lr.urgent) be.classList.add('urgent');
      afterReply(lr);
      busy = false; $('#chat-send').disabled = false; $('#chat-input').focus();
      return;
    }
    if (getPhone(text) || getRef(text) || sflow || flow) {
      typing(false);
      addMsg('bot', 'I can only check bookings with the reference and mobile number together. You can also use Track Booking.\n[[go:track|Open Track Booking]]', false);
      busy = false; $('#chat-send').disabled = false; return;
    }
    try {
      let ok = false;
      ok = false; /* no streaming: every fallback reply is checked before it is shown */
      if (!ok) {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-10) })
        });
        const data = await res.json().catch(() => ({}));
        typing(false);
        if (!res.ok) throw new Error(data.error || 'Chat is unavailable right now');
        addMsg('bot', safeAI(data.reply));
      }
    } catch (e) {
      typing(false);
      addMsg('bot', 'I am having trouble right now - please try again in a moment, or call the clinic directly from its page.');
    }
    busy = false;
    $('#chat-send').disabled = false;
    $('#chat-input').focus();
  }

  function afterReply(lr) {
    setChips(lr && lr.chips ? lr.chips : lr && lr.symptom ? [
      { label: 'How do I book?', q: 'How do I book an appointment?' },
      { label: 'Fees / payment', q: 'How do I pay?' },
      { label: 'Another symptom', q: 'I have another problem' }
    ] : (ctxChips(ctx()) || DEFAULT_CHIPS));
  }

  const WELCOME = 'Hello, I am the Drayvenn assistant. Tell me what you are feeling and I will suggest the right kind of doctor, or ask me about booking, fees, cancelling and tracking. You can write in English, Hindi or Hinglish.\n_I am not a doctor. I only guide you to the right specialty, I do not diagnose or give medical advice._';
  let lastSig = '';
  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    $('#chat-panel').classList.toggle('hidden', !open);
    $('#chat-fab').classList.toggle('open', open);
    if (!open) clearInterval(window._dhCtxT);
    if (open) {
      hookTrail();
      const c0 = ctx(), sig = ctxLabel(c0);
      refreshCtx();
      clearInterval(window._dhCtxT); window._dhCtxT = setInterval(refreshCtx, 1500);
      const cc = ctxChips(c0); if (cc) setChips(cc);
      if (greeted && sig !== lastSig && c0.view !== 'home') {
        const hint = c0.wiz && c0.doctor ? `I can see you are booking with ${c0.doctor.name}. I can show open slots or guide you step by step.` : c0.view === 'clinic' && c0.clinic ? `I can see you are viewing ${c0.clinic.name}. Want its open slots, doctors and fees, or help booking?` : '';
        if (hint) setTimeout(() => addMsg('bot', hint, false), 300);
      }
      lastSig = sig;
      if (!greeted) {
        greeted = true;
        setTimeout(() => addMsg('bot', WELCOME), 350);
        if (c0.view !== 'home' && (c0.wiz || c0.clinic)) setTimeout(() => addMsg('bot', c0.wiz && c0.doctor ? `I can see you are booking with ${c0.doctor.name}. I can show open slots or guide you step by step.` : `I can see you are viewing ${c0.clinic.name}. Want its open slots, doctors and fees, or help booking?`, false), 1100);
      }
      scrollDown();
      setTimeout(() => $('#chat-input').focus(), 250);
    }
  }

  function clearChat() {
    history.length = 0;
    try { sessionStorage.removeItem('dh_chat'); sessionStorage.removeItem('dh_mem'); } catch (e) {}
    mem.spec = mem.area = mem.clinicId = null; mem.lastShown = []; mem.hi = 0;
    flow = null; sflow = null; creds = null; lastSpec = null;
    msgsEl.innerHTML = '';
    setChips(ctxChips(ctx()) || DEFAULT_CHIPS);
    setTimeout(() => addMsg('bot', WELCOME, false), 250);
  }
  $('#chat-clear').onclick = () => $('#chat-confirm').classList.toggle('hidden');
  $('#chat-clear-no').onclick = () => $('#chat-confirm').classList.add('hidden');
  $('#chat-clear-yes').onclick = () => { $('#chat-confirm').classList.add('hidden'); clearChat(); };
  // mobile: keep the panel inside the visible area when the keyboard opens, lock page scroll behind it
  const vv = window.visualViewport;
  function fitPanel() {
    const pn = $('#chat-panel');
    if (!pn || !open) return;
    if (window.innerWidth <= 600 && vv) { pn.style.height = vv.height + 'px'; pn.style.top = vv.offsetTop + 'px'; pn.style.bottom = 'auto'; }
    else { pn.style.height = ''; pn.style.top = ''; pn.style.bottom = ''; }
    scrollDown();
  }
  if (vv) { vv.addEventListener('resize', fitPanel); vv.addEventListener('scroll', fitPanel); }
  const _toggleOrig = toggle;
  toggle = function (force) { _toggleOrig(force); document.body.classList.toggle('chat-open', open && window.innerWidth <= 600); setTimeout(fitPanel, 50); };
  // restore
  for (const m of history) addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content, false);
  const DEFAULT_CHIPS = [
    { label: 'Symptoms', q: 'I have a health problem' },
    { label: 'Book Appointment', q: 'I want to book an appointment' },
    { label: 'Track Booking', q: 'Check my booking status' },
    { label: 'Talk to Support', q: 'Talk to support' },
    { label: 'Cancel booking', q: 'How do I cancel my booking?' },
    { label: 'Hindi mein batao', q: 'Mujhe booking kaise karni hai?' }
  ];
  setChips(DEFAULT_CHIPS);

  setTimeout(hookTrail, 1500); window.addEventListener('load', hookTrail);
  window.openChat = () => toggle(true);
  window.closeChat = () => toggle(false);
  window.chatIsOpen = () => open;
  $('#chat-fab').onclick = () => toggle();
  $('#chat-close').onclick = () => toggle(false);
  $('#chat-form').onsubmit = e => { e.preventDefault(); send($('#chat-input').value); };
})();
