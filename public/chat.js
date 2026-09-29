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
          <div class="chat-head-sub"><span class="chat-dot"></span>Online · 24x7</div>
        </div>
        <button id="chat-close" aria-label="Close chat">✕</button>
      </div>
      <div class="chat-disclaimer">Booking help only - no medical advice</div>
      <div id="chat-msgs"></div>
      <div id="chat-chips"></div>
      <form id="chat-form">
        <input id="chat-input" placeholder="Ask about clinics, booking, fees..." autocomplete="off" maxlength="500">
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
    text = text.replace(/[ \t]+\n/g, '\n').trim();
    let html = esc(text).replace(/\n/g, '<br>');
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

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    $('#chat-send').disabled = true;
    addMsg('user', text);
    $('#chat-input').value = '';
    typing(true);
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

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    $('#chat-panel').classList.toggle('hidden', !open);
    $('#chat-fab').classList.toggle('open', open);
    if (open) {
      if (!greeted) {
        greeted = true;
        setTimeout(() => addMsg('bot', 'Hi! I am the Drayvenn assistant, here 24x7. I help with booking appointments, finding the right doctor, fees, timings and booking status. I cannot give medical advice - for that, please consult a doctor. What do you need?'), 350);
      }
      scrollDown();
      setTimeout(() => $('#chat-input').focus(), 250);
    }
  }

  // restore
  for (const m of history) addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content, false);
  setChips([
    { label: '📅 Book an appointment', q: 'I want to book an appointment' },
    { label: '🔎 Track my booking', goto: 'mybookings' },
    { label: '🕐 Clinic timings', q: 'What are the clinic timings?' },
    { label: '💰 Fees', q: 'What are the consultation fees?' }
  ]);

  window.openChat = () => toggle(true);
  window.closeChat = () => toggle(false);
  window.chatIsOpen = () => open;
  $('#chat-fab').onclick = () => toggle();
  $('#chat-close').onclick = () => toggle(false);
  $('#chat-form').onsubmit = e => { e.preventDefault(); send($('#chat-input').value); };
})();
