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
        <button id="chat-close" aria-label="Close chat">✕</button>
      </div>
      <div class="chat-disclaimer">Guidance only · not medical advice. Emergency: call 108 / 112</div>
      <div id="chat-msgs"></div>
      <div id="chat-chips"></div>
      <form id="chat-form">
        <input id="chat-input" placeholder="Describe symptoms or ask in Hindi / English" autocomplete="off" maxlength="500">
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
    container.querySelectorAll('button[data-spec]').forEach(b => { b.onclick = () => runSpec(b.dataset.spec); });
    container.querySelectorAll('button[data-goto]').forEach(b => {
      b.onclick = () => {
        toggle(false);
        if (window.showFromChat) window.showFromChat(b.dataset.goto);
      };
    });
  }

  function renderText(t) {
    // pull [[clinic:ID]] tokens out of the text; render their buttons after it
    const ids = [];
    let text = String(t).replace(/\[\[clinic:([a-z0-9-]+)\]\]/gi, (m, id) => { ids.push(id); return ''; });
    const acts = [];
    text = text.replace(/\[\[spec:([A-Za-z ]+)\]\]/g, (m, sp) => { acts.push(`<button class="chat-action spec" data-spec="${esc(sp)}">Find ${esc(sp)} clinics</button>`); return ''; });
    text = text.replace(/\[\[go:([a-z]+)\|([^\]]+)\]\]/g, (m, v, l) => { acts.push(`<button class="chat-action" data-goto="${esc(v)}">${esc(l)} \u2192</button>`); return ''; });
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    let html = esc(text).replace(/\n/g, '<br>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|<br>)_([^<]+)_(?=<br>|$)/g, '$1<span class="chat-note">$2</span>');
    html += acts.length ? '<div class="chat-acts">' + acts.join('') + '</div>' : '';
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      html += `<button class="chat-action" data-clinic="${esc(id)}">View clinic →</button>`;
    }
    return html;
  }

  function addMsg(role, content, save = true) {
    const el = document.createElement('div');
    el.className = 'chat-msg ' + role;
    el.innerHTML = role === 'bot' ? renderText(content) : esc(content);
    msgsEl.appendChild(el);
    linkifyActions(el);
    scrollDown();
    if (save) {
      history.push({ role: role === 'bot' ? 'assistant' : 'user', content });
      while (history.length > 20) history.shift();
      sessionStorage.setItem('dh_chat', JSON.stringify(history));
    }
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
            el.textContent = full;
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
    { spec: 'Paediatrics', re: /(child|children|kid|baby|infant|toddler|newborn|bacch|bache|bachh|shishu|vaccin|tika|teeka|immuni)/ },
    { spec: 'Dental', re: /(tooth|teeth|dant|daant|gum|cavity|toothache|dentist|jaw|wisdom|root canal|braces|filling|dental)/ },
    { spec: 'Dermatology', re: /(skin|rash|acne|pimple|itch|khujli|daane|daana|allerg|eczema|fungal|ringworm|dandruff|pigment|dark spot|hair|baal|jhad)/ },
    { spec: 'Orthopaedics', re: /(joint|knee|ghutn|back pain|kamar|backache|neck pain|gardan|shoulder|kandha|sprain|fracture|bone|haddi|ligament|sports|injur|chot|muscle pain|arthritis|heel|ankle|physio)/ },
    { spec: 'Diabetology', re: /(sugar|diabet|madhumeh|thyroid|insulin|hba1c)/ },
    { spec: 'General Medicine', re: /(fever|bukhar|cold|cough|khansi|khasi|sardi|zukam|flu|viral|throat|gala|sore|headache|sir dard|sar dard|migraine|body pain|badan|weakness|kamzori|thakan|fatigue|vomit|ulti|nausea|diarrh|loose motion|dast|stomach|pet dard|pet mein|acidity|gas|infection|bp|blood pressure|dizz|chakkar|check ?up|checkup)/ }
  ];
  const SPEC_NOTE = {
    'General Medicine': ['a General Physician', 'General Physician'],
    'Paediatrics': ['a Paediatrician (child specialist)', 'Bachchon ke doctor (Paediatrician)'],
    'Dental': ['a Dentist', 'Dentist'],
    'Dermatology': ['a Dermatologist (skin and hair)', 'Skin aur baal ke doctor (Dermatologist)'],
    'Orthopaedics': ['an Orthopaedic doctor (bones and joints)', 'Haddi aur jodon ke doctor (Orthopaedic)'],
    'Diabetology': ['a Diabetologist', 'Sugar ke doctor (Diabetologist)']
  };
  const EMERG = /(chest pain|seene (me|mein)|heart attack|dil ka daura|can.?t breathe|cannot breathe|breathless|breathing (problem|trouble|difficult)|saans (nahi|nhi|phool|lene)|unconscious|behosh|faint|seizure|fits|daura|stroke|lakwa|heavy bleeding|bahut khoon|khoon (nahi ruk|beh)|poison|overdose|suicid|marna chahta|marna chahti|accident)/;
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
    emerg: ['This sounds urgent. Please call 108 or 112 now, or go to the nearest emergency room. Do not wait for an appointment. Once things are stable, I can help you book a follow-up.', 'Ye zaroori lag raha hai. Abhi 108 ya 112 par call kijiye ya nazdiki emergency mein jaiye. Appointment ka intezaar mat kijiye. Halat sambhalne ke baad main follow-up booking mein madad karunga.'],
    ask: ['Could you tell me a little more? For example, what you are feeling and for how long, or who the patient is (you, a child, a parent).', 'Thoda aur bataiye? Jaise kya takleef hai aur kab se, ya patient kaun hai (aap, bachcha, mata-pita).']
  };

  function localReply(raw) {
    const t = ' ' + raw.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s.?]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const hi = isHi(t) ? 1 : 0;
    const L = k => T[k][hi];
    const has = re => re.test(t);
    if (has(EMERG)) return { text: L('emerg') + '\n[[go:clinics|Find a clinic]]', urgent: true };
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

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    $('#chat-send').disabled = true;
    addMsg('user', text);
    $('#chat-input').value = '';
    typing(true);
    const lr = localReply(text);
    if (lr) {
      await new Promise(r => setTimeout(r, 450 + Math.min(500, lr.text.length * 2)));
      typing(false);
      addMsg('bot', lr.text);
      afterReply(lr);
      busy = false; $('#chat-send').disabled = false; $('#chat-input').focus();
      return;
    }
    try {
      let ok = false;
      try { ok = await sendStreaming(); } catch (e) { ok = false; }
      if (!ok) {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-10) })
        });
        const data = await res.json().catch(() => ({}));
        typing(false);
        if (!res.ok) throw new Error(data.error || 'Chat is unavailable right now');
        addMsg('bot', data.reply || 'Sorry, I did not catch that.');
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
    setChips(lr && lr.symptom ? [
      { label: 'How do I book?', q: 'How do I book an appointment?' },
      { label: 'Fees / payment', q: 'How do I pay?' },
      { label: 'Another symptom', q: 'I have another problem' }
    ] : DEFAULT_CHIPS);
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    $('#chat-panel').classList.toggle('hidden', !open);
    $('#chat-fab').classList.toggle('open', open);
    if (open) {
      if (!greeted) {
        greeted = true;
        setTimeout(() => addMsg('bot', 'Hello, I am the Drayvenn assistant. Tell me what you are feeling and I will suggest the right kind of doctor, or ask me about booking, fees, cancelling and tracking. You can write in English, Hindi or Hinglish.\n_I am not a doctor. I only guide you to the right specialty, I do not diagnose._'), 350);
      }
      scrollDown();
      setTimeout(() => $('#chat-input').focus(), 250);
    }
  }

  // restore
  for (const m of history) addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content, false);
  const DEFAULT_CHIPS = [
    { label: 'I have symptoms', q: 'I have a health problem' },
    { label: 'How to book', q: 'How do I book an appointment?' },
    { label: 'Payment', q: 'How do I pay?' },
    { label: 'Cancel booking', q: 'How do I cancel my booking?' },
    { label: 'Track booking', goto: 'track' },
    { label: 'Hindi mein batao', q: 'Mujhe booking kaise karni hai?' }
  ];
  setChips(DEFAULT_CHIPS);

  window.openChat = () => toggle(true);
  window.closeChat = () => toggle(false);
  window.chatIsOpen = () => open;
  $('#chat-fab').onclick = () => toggle();
  $('#chat-close').onclick = () => toggle(false);
  $('#chat-form').onsubmit = e => { e.preventDefault(); send($('#chat-input').value); };
})();
