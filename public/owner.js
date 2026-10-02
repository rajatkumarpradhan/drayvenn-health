(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const VIEWS = ['v-loading', 'v-off', 'v-setup', 'v-login', 'v-home', 'v-form', 'v-done'];
  const DAYS = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
  let csrf = null, last = null;
  const show = id => { VIEWS.forEach(v => $(v).classList.toggle('hidden', v !== id)); window.scrollTo(0, 0); };
  const err = (id, m) => { const e = $(id); e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; };
  const toast = m => { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 2200); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) { o.body = JSON.stringify(opts.body); o.headers['Content-Type'] = 'application/json'; }
    if (o.method !== 'GET' && csrf) o.headers['X-CSRF-Token'] = csrf;
    const r = await fetch(path, o);
    let d = {}; try { d = await r.json(); } catch (e) { /* empty */ }
    if (r.status === 401 && path !== '/api/owner/login') { csrf = null; $('who').classList.add('hidden'); $('l-note').classList.remove('hidden'); show('v-login'); throw new Error('Session expired'); }
    if (!r.ok) throw new Error(d.error || 'Something went wrong');
    return d;
  }
  function authed(email) { $('who-email').textContent = email; $('who').classList.remove('hidden'); }

  document.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => {
    const i = $(b.dataset.toggle); const h = i.type === 'password'; i.type = h ? 'text' : 'password'; b.textContent = h ? 'Hide' : 'Show';
  });

  async function init() {
    show('v-loading');
    let me;
    try { me = await (await fetch('/api/owner/me', { credentials: 'same-origin' })).json(); } catch (e) { show('v-off'); return; }
    const m = location.hash.match(/^#setup=([0-9a-f]{48})$/);
    if (!me.configured) { if (m) { show('v-setup'); } else show('v-off'); return; }
    if (m) history.replaceState(null, '', location.pathname);
    if (!me.authed) { show('v-login'); return; }
    csrf = me.csrf; authed(me.email); loadHome();
  }

  $('f-setup').onsubmit = async e => {
    e.preventDefault(); err('s-err');
    const pw = $('s-pass').value;
    if (pw !== $('s-pass2').value) return err('s-err', 'The two passwords do not match');
    const m = location.hash.match(/^#setup=([0-9a-f]{48})$/);
    if (!m) return err('s-err', 'This setup link is not valid. Open the full link again.');
    try {
      const d = await api('/api/owner/setup', { method: 'POST', body: { token: m[1], email: $('s-email').value, password: pw } });
      history.replaceState(null, '', location.pathname); $('s-pass').value = $('s-pass2').value = '';
      csrf = d.csrf; authed(d.email); loadHome();
    } catch (x) { err('s-err', x.message); }
  };
  $('f-login').onsubmit = async e => {
    e.preventDefault(); err('l-err');
    const btn = e.target.querySelector('button.ow-btn'); btn.disabled = true;
    try {
      const d = await api('/api/owner/login', { method: 'POST', body: { email: $('l-email').value, password: $('l-pass').value } });
      $('l-pass').value = ''; $('l-note').classList.add('hidden'); csrf = d.csrf; authed(d.email); loadHome();
    } catch (x) { err('l-err', x.message); } finally { btn.disabled = false; }
  };
  $('logout').onclick = async () => { try { await api('/api/owner/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ } csrf = null; $('who').classList.add('hidden'); $('l-note').classList.add('hidden'); show('v-login'); };

  async function loadHome() {
    show('v-home');
    try {
      const d = await api('/api/owner/clinics');
      $('h-count').textContent = d.clinics.length + (d.clinics.length === 1 ? ' clinic' : ' clinics') + ' on the platform';
      $('h-list').innerHTML = d.clinics.map(c => `<div class="ow-item"><div><b>${esc(c.name)}</b><span>${esc(c.area)} &middot; ${esc(c.phone)}</span><span>${esc(c.admin_email || 'no admin login')}</span></div><span class="ow-pill ${/^SAMPLE\b/i.test(c.name) ? 's' : ''}">${/^SAMPLE\b/i.test(c.name) ? 'Sample' : 'Live'} &middot; ${c.doctors} dr</span></div>`).join('');
    } catch (x) { /* handled */ }
  }
  $('b-list').onclick = loadHome;

  function docBlock(i) {
    const el = $('doc-' + i);
    el.innerHTML = `<h2>${i + 3}. Doctor ${i + 1}${i ? ' (optional)' : ''}</h2>
      <label for="d${i}-name">Doctor name</label><input id="d${i}-name" maxlength="80" placeholder="Dr. ...">
      <div class="ow-grid">
        <div><label for="d${i}-spec">Specialty</label><input id="d${i}-spec" maxlength="60" placeholder="e.g. General Medicine"></div>
        <div><label for="d${i}-qual">Qualification</label><input id="d${i}-qual" maxlength="100" placeholder="e.g. MBBS, MD"></div>
        <div><label for="d${i}-exp">Experience (years)</label><input id="d${i}-exp" inputmode="numeric" maxlength="2"></div>
        <div><label for="d${i}-fee">Fee (Rs, paid at clinic)</label><input id="d${i}-fee" inputmode="numeric" maxlength="5"></div>
      </div>
      <label>Working days <button type="button" class="ow-link" data-sixdays="${i}">Mon - Sat</button></label>
      <div class="ow-days" id="d${i}-days">${DAYS.map(d => `<button type="button" class="ow-day" data-day="${d[1]}">${d[0]}</button>`).join('')}</div>
      <label>Timings</label>
      <div class="ow-sess"><div><span class="ow-hint">Session 1 from / to</span><div class="ow-grid"><input id="d${i}-s0a" type="time"><input id="d${i}-s0b" type="time"></div></div>
      <div><span class="ow-hint">Session 2 (optional)</span><div class="ow-grid"><input id="d${i}-s1a" type="time"><input id="d${i}-s1b" type="time"></div></div></div>`;
    el.querySelectorAll('.ow-day').forEach(b => b.onclick = () => b.classList.toggle('on'));
    el.querySelector('[data-sixdays]').onclick = () => el.querySelectorAll('.ow-day').forEach(b => b.classList.toggle('on', b.dataset.day !== '0'));
  }
  function readDoc(i) {
    const days = [...document.querySelectorAll(`#d${i}-days .ow-day.on`)].map(b => +b.dataset.day);
    const sessions = [];
    for (const k of [0, 1]) { const a = $(`d${i}-s${k}a`).value, b = $(`d${i}-s${k}b`).value; if (a || b) sessions.push({ start: a, end: b }); }
    return { name: $(`d${i}-name`).value, specialty: $(`d${i}-spec`).value, qualification: $(`d${i}-qual`).value, experience_years: $(`d${i}-exp`).value, fee: $(`d${i}-fee`).value, days, sessions };
  }
  function resetForm() {
    ['c-name', 'c-area', 'c-phone', 'c-addr', 'c-spec', 'c-time', 'a-email', 'a-pass'].forEach(k => $(k).value = '');
    $('c-sample').checked = false; docBlock(0); docBlock(1); $('doc-1').classList.add('hidden'); $('b-adddoc').classList.remove('hidden'); err('f-err');
  }
  $('b-new').onclick = $('b-more').onclick = () => { resetForm(); show('v-form'); };
  $('b-back').onclick = loadHome;
  $('b-adddoc').onclick = () => { $('doc-1').classList.remove('hidden'); $('b-adddoc').classList.add('hidden'); };
  $('b-gen').onclick = () => {
    const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', sym = '!@#$%*?';
    const buf = new Uint32Array(16); crypto.getRandomValues(buf);
    let p = ''; for (let i = 0; i < 14; i++) p += set[buf[i] % set.length];
    p += sym[buf[14] % sym.length] + (buf[15] % 90 + 10);
    $('a-pass').value = p;
  };

  $('f-clinic').onsubmit = async e => {
    e.preventDefault(); err('f-err');
    const docs = [readDoc(0)]; if (!$('doc-1').classList.contains('hidden')) docs.push(readDoc(1));
    const body = { clinic: { name: $('c-name').value, area: $('c-area').value, phone: $('c-phone').value, address: $('c-addr').value, specialties: $('c-spec').value, timings: $('c-time').value, sample: $('c-sample').checked },
      admin: { email: $('a-email').value, password: $('a-pass').value }, doctors: docs };
    const btn = $('b-save'); btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const d = await api('/api/owner/clinics', { method: 'POST', body });
      last = { url: location.origin + '/clinic-admin/login', email: d.admin_email, pass: body.admin.password, name: d.clinic.name };
      $('d-sum').textContent = `${d.clinic.name} (${d.clinic.area}) with ${d.doctors.length} doctor${d.doctors.length > 1 ? 's' : ''} is live on the patient site.`;
      $('d-url').textContent = last.url; $('d-email').textContent = last.email; $('d-pass').textContent = last.pass;
      $('a-pass').value = ''; show('v-done');
    } catch (x) { if (x.message !== 'Session expired') err('f-err', x.message); }
    finally { btn.disabled = false; btn.textContent = 'Create clinic'; }
  };
  $('b-copy').onclick = async () => {
    if (!last) return;
    const txt = `${last.name} - clinic login\n${last.url}\nEmail: ${last.email}\nPassword: ${last.pass}`;
    try { await navigator.clipboard.writeText(txt); toast('Copied'); } catch (e) { toast('Copy failed - select and copy manually'); }
  };
  init();
})();
