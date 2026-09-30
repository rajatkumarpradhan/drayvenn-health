/* Splash: CSS animation self-dismisses; JS just removes the node. */
setTimeout(() => { const sp = document.getElementById('splash'); if (sp) sp.remove(); }, 2000);

/* PWA: register the service worker after load; failures are silent (plain
   website keeps working identically without it). */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

const state = {
  clinics: [],
  filter: { q: '', specs: [], area: 'All', avail: 'all', price: 'all', sort: 'earliest' },
  geo: null,
  browse: 'clinics', mapMode: 'list',
  clinic: null,
  booking: { doctor: null, date: null, slot: null },
  lastBooking: null,
  patient: null
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function show(view) {
  // safety: a stuck scroll lock must never survive a view switch
  if (!document.getElementById('wizard-overlay')) document.body.classList.remove('wiz-open');
  if (view === 'mybookings') renderAccount();
  if (view === 'account') renderAccountPage();
  for (const v of ['home', 'clinics', 'clinic', 'confirm', 'mybookings', 'track', 'signin', 'account', 'about', 'services', 'contact', '404']) {
    const el = document.getElementById('view-' + v);
    el.classList.toggle('hidden', v !== view);
    if (v === view) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
      requestAnimationFrame(segSlideAll);
    }
  }
  const tabFor = { home: 'home', clinics: 'search', clinic: 'search', confirm: 'home', mybookings: 'mybookings', track: 'mybookings', account: 'profile' };
  document.querySelectorAll('.tabbar .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabFor[view]));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

const toastQueue = [];
let toastActive = false;
function toast(msg, kind) {
  toastQueue.push({ msg, kind: kind || 'info' });
  if (!toastActive) nextToast();
}
function nextToast() {
  const item = toastQueue.shift();
  if (!item) { toastActive = false; return; }
  toastActive = true;
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast ' + item.kind;
  t.textContent = item.msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.remove(); nextToast(); }, 260);
  }, 3200);
}

function fmtDate(dstr) {
  const d = new Date(dstr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(dstr) {
  const d = new Date(dstr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtTime(t) {
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function toISODate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtNext(n) {
  if (!n) return null;
  if (n.today) return 'Today, ' + fmtTime(n.time);
  if (n.tomorrow) return 'Tomorrow, ' + fmtTime(n.time);
  return fmtDateShort(n.date) + ', ' + fmtTime(n.time);
}

async function api(path, opts) {
  opts = opts || {};
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Something went wrong');
  return data;
}

/* ---------- HOME ---------- */
async function loadClinics() {
  try {
    const { clinics } = await api('/api/clinics');
    state.clinics = clinics;
    renderSpecChips();
    renderAreaFilter();
    renderHomeExtras();
    renderRecentClinics();
    renderFeatured();
    renderBrowse();
  } catch (e) {
    $('#clinic-list').innerHTML = '<div class="loading">Could not load clinics. <a href="/">Retry</a></div>';
  }
}

function renderAreaFilter() {
  const sel = $('#area-filter');
  if (!sel) return;
  const areas = [...new Set(state.clinics.map(c => c.area))].sort();
  const cur = state.filter.area;
  sel.innerHTML = '<option value="All">All areas</option>' +
    areas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  sel.value = areas.includes(cur) ? cur : 'All';
  state.filter.area = sel.value;
  sel.onchange = () => { state.filter.area = sel.value; renderActiveFilters(); renderBrowse(); };
}

/* ---------- recently viewed clinics (local only, never leaves the device) ---------- */
function recordRecentClinic(c) {
  try {
    const list = JSON.parse(localStorage.getItem('dh-recent') || '[]').filter(x => x.id !== c.id);
    list.unshift({ id: c.id, name: c.name, area: c.area, emoji: c.emoji });
    localStorage.setItem('dh-recent', JSON.stringify(list.slice(0, 4)));
  } catch {}
  renderRecentClinics();
}
function renderRecentClinics() {
  const wrap = $('#recent-wrap'), host = $('#recent-chips');
  if (!wrap || !host) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem('dh-recent') || '[]'); } catch {}
  const valid = list.filter(x => state.clinics.some(c => c.id === x.id));
  if (!valid.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  host.innerHTML = valid.map(x => `<button class="chip" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('');
  host.querySelectorAll('.chip').forEach(b => b.onclick = () => openClinic(b.dataset.id));
}

function renderHomeExtras() {
  const specs = new Map();
  state.clinics.forEach(c => c.specialties.forEach(s => specs.set(s, (specs.get(s) || 0) + 1)));
  const SPEC_ICON = {
    'General Medicine': 'auscultate', 'Diabetology': 'bloodbag', 'Fever Care': 'thermometer',
    'Vaccination': 'syringe', 'Orthopaedics': 'fracture-leg', 'Sports Injury': 'bandage',
    'Dermatology': 'dermatology', 'Dental': 'tooth'
  };
  const specCirc = s => {
    const ic = SPEC_ICON[s] || (!SPEC_EMOJI[s] ? 'hospital' : null);
    return `<img class="spec-ic" src="brand/icons/${ic || 'hospital'}.webp" alt="" loading="lazy" decoding="async">`;
  };
  const SPEC_EMOJI = {
    'General Medicine': '🩺', 'Diabetology': '🩸', 'Fever Care': '🌡️', 'Paediatrics': '🧸',
    'Vaccination': '💉', 'Family Medicine': '👨‍👩‍👧', 'Orthopaedics': '🦴', 'Physiotherapy': '🤸',
    'Sports Injury': '🏃', 'Dermatology': '🧴', 'Hair Care': '💇', 'Allergy': '🤧',
    'Dental': '🦷', 'Orthodontics': '😁', 'Root Canal': '🪥'
  };
  // live activity pill (aggregate count, /api/stats)
  fetch('api/stats').then(r => r.ok ? r.json() : null).then(d => {
    if (d && d.bookings > 0) {
      const lp = $('#live-pill'), lt = $('#live-text');
      if (lp && lt) { lt.textContent = d.bookings + ' appointments booked so far'; lp.classList.remove('hidden'); }
    }
  }).catch(() => {});
  const tbInner = document.querySelector('.topbar-inner');
  if (tbInner) {
    const onScroll = () => tbInner.classList.toggle('scrolled', window.scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  const host = $('#browse-specs');
  if (host) {
    host.innerHTML = [...specs.entries()].slice(0, 8).map(([s, n], i) =>
      `<button class="spec-circle-btn reveal" style="--i:${i}" data-spec="${esc(s)}" aria-label="Book a clinic for ${esc(s)}"><span class="spec-circ">${specCirc(s)}</span><span class="spec-circ-name">${esc(s)}</span></button>`).join('');
    host.querySelectorAll('.spec-circle-btn').forEach(b => b.onclick = () => {
      state.filter.specs = [b.dataset.spec];
      renderSpecChips(); renderActiveFilters(); renderBrowse();
      show('clinics');
    });
  }
  document.querySelectorAll('.svc-card').forEach(b => b.onclick = () => {
    state.filter.specs = [b.dataset.spec];
    renderSpecChips(); renderActiveFilters(); renderBrowse();
    show('clinics');
  });
  const ah = $('#home-areas');
  if (ah) {
    const areas = [...new Set(state.clinics.map(c => c.area))].sort();
    ah.innerHTML = areas.map(a => `<button class="chip" data-area="${esc(a)}">${PIN_SVG} ${esc(a)}</button>`).join('');
    ah.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      state.filter.area = b.dataset.area;
      const sel = $('#area-filter');
      if (sel) sel.value = b.dataset.area;
      renderBrowse();
      show('clinics');
    });
  }
  const ha = $('#home-area');
  if (ha && ha.options.length <= 1) {
    [...new Set(state.clinics.map(c => c.area))].sort().forEach(a => {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      ha.appendChild(o);
    });
  }
  renderSoonRow();
  watchReveals(host);
}

const PIN_SVG = '<svg class="pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const UI_ICONS = {
  cal: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6 15h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pulse: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/><path d="M9 11.5l2.2 2.2L15.5 9.5"/>',
  arrow: '<path d="M7 17L17 7M9.5 7H17v7.5"/>'
};
function uiIcon(name) {
  return `<svg class="pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name]}</svg>`;
}
const DOC_AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';
const CLINIC_MARK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M12 7v4M10 9h4"/></svg>';
function clinicMark(c, cls) {
  return `<div class="clinic-mark ${cls || ''}" aria-hidden="true">${CLINIC_MARK_SVG}</div>`;
}

function renderSoonRow() {
  const host = $('#soon-row');
  if (!host || !state.clinics.length) return;
  const rank = n => (n.today ? '0' : n.tomorrow ? '1' : '2' + n.date) + n.time;
  const soon = state.clinics.filter(c => c.next_available)
    .sort((a, b) => rank(a.next_available).localeCompare(rank(b.next_available)));
  host.innerHTML = soon.map((c, i) => `
    <div class="soon-card reveal" style="--i:${i}" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="View ${esc(c.name)}, next slot ${esc(fmtNext(c.next_available))}">
      ${clinicMark(c, 'sm')}
      <div class="soon-name">${esc(c.name)}</div>
      <div class="soon-slot">${esc(fmtNext(c.next_available))}</div>
    </div>`).join('');
  host.querySelectorAll('.soon-card').forEach(el => {
    el.onclick = () => openClinic(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClinic(el.dataset.id); } };
  });
  watchReveals(host);
}

/* ---------- ACCOUNT PAGE ---------- */
const ACCT_ICONS = {
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="M9 15.5l2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3.2A8 8 0 1 1 21 12z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.6-5.6l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.6 5.6l1.5-1.5"/>',
  logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  hospital: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M12 9v6M9 12h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'
};
function acctIcon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ACCT_ICONS[name] || ACCT_ICONS.info}</svg>`;
}
function acctRow(id, icon, label, danger) {
  return `<button type="button" class="acctp-row${danger ? ' danger' : ''}" id="${id}">
    <span class="acctp-ico">${acctIcon(icon)}</span><span class="acctp-label">${label}</span><span class="acctp-chev">›</span>
  </button>`;
}

function renderAccountPage() {
  const host = $('#account-page');
  if (!host) return;
  const p = state.patient;
  const about = `
    <div class="acctp-about hidden" id="acctp-about">
      Drayvenn Health is a clinic-booking product by Drayvenn Lab, built for neighbourhood clinics in Bengaluru.
      Patients book real slots in under a minute and pay at the clinic. The clinics shown in this demo are
      marked SAMPLE - no real clinic data is used yet. One account keeps every booking in one place.
    </div>`;
  let html = '<h2 class="section-title" style="margin-top:18px">Account</h2>';
  if (p) {
    const initial = esc(((p.name || p.email || 'A').trim()[0] || 'A').toUpperCase());
    html += `
    <div class="acctp-card">
      <div class="acctp-avatar">${initial}</div>
      <div class="acctp-info">
        <div class="acctp-name" id="acctp-name">${esc(p.name || 'Set your name')}</div>
        <div class="acctp-sub">${esc(p.email || (p.phone ? maskPhone(p.phone) : 'Signed in'))}${p.has_google ? ' · Signed in with Google' : ''}</div>
      </div>
      <button type="button" class="acctp-edit" id="acctp-edit-btn">EDIT</button>
    </div>
    <div class="acctp-editbox hidden" id="acctp-editbox">
      <div class="form-row"><label for="acctp-in-name">Your name</label><input id="acctp-in-name" maxlength="60" autocomplete="name" value="${esc(p.name || '')}" placeholder="Used to prefill bookings"></div>
      <div class="form-row"><label for="acctp-in-age">Age</label><input id="acctp-in-age" inputmode="numeric" maxlength="3" value="${p.age != null ? p.age : ''}" placeholder="Optional"></div>
      <div class="form-error" id="acctp-error"></div>
      <button type="button" class="btn btn-block" id="acctp-save">Save</button>
    </div>
    <div class="acctp-group">Bookings</div>
    <div class="acctp-list">
      ${acctRow('acp-bookings', 'calendar', 'My bookings')}
      ${acctRow('acp-track', 'search', 'Track a booking')}
    </div>
    <div class="acctp-group">Support</div>
    <div class="acctp-list">
      ${acctRow('acp-chat', 'chat', 'Talk to the assistant')}
      <a class="acctp-row" href="mailto:hello@drayvennlab.in"><span class="acctp-ico">${acctIcon('mail')}</span><span class="acctp-label">Email - hello@drayvennlab.in</span><span class="acctp-chev">›</span></a>
      <a class="acctp-row" href="https://wa.me/917735521019?text=Hi%20Drayvenn%20Health" target="_blank" rel="noopener"><span class="acctp-ico">${acctIcon('phone')}</span><span class="acctp-label">WhatsApp - +91 77355 21019</span><span class="acctp-chev">›</span></a>
      ${acctRow('acp-privacy', 'lock', 'Privacy & data')}
      ${acctRow('acp-about', 'info', 'About Drayvenn Health')}
    </div>
    ${about}
    <div class="acctp-group">Account</div>
    <div class="acctp-list">
      ${!p.has_google ? acctRow('acp-google', 'link', 'Connect Google account') : ''}
      ${acctRow('acp-logout', 'logout', 'Sign out', true)}
    </div>`;
  } else {
    html += `
    <div class="acctp-card">
      <div class="acctp-avatar guest"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg></div>
      <div class="acctp-info">
        <div class="acctp-name">Not signed in</div>
        <div class="acctp-sub">Sign in for saved details &amp; booking history</div>
      </div>
      <button type="button" class="acctp-edit" id="acctp-signin-btn">SIGN IN</button>
    </div>
    <div class="acctp-group">Bookings</div>
    <div class="acctp-list">
      ${acctRow('acp-track', 'search', 'Track a booking')}
    </div>
    <div class="acctp-group">Support</div>
    <div class="acctp-list">
      ${acctRow('acp-chat', 'chat', 'Talk to the assistant')}
      <a class="acctp-row" href="mailto:hello@drayvennlab.in"><span class="acctp-ico">${acctIcon('mail')}</span><span class="acctp-label">Email - hello@drayvennlab.in</span><span class="acctp-chev">›</span></a>
      <a class="acctp-row" href="https://wa.me/917735521019?text=Hi%20Drayvenn%20Health" target="_blank" rel="noopener"><span class="acctp-ico">${acctIcon('phone')}</span><span class="acctp-label">WhatsApp - +91 77355 21019</span><span class="acctp-chev">›</span></a>
      ${acctRow('acp-privacy', 'lock', 'Privacy & data')}
      ${acctRow('acp-about', 'info', 'About Drayvenn Health')}
    </div>
    ${about}
    <div class="acctp-group">For clinics</div>
    <div class="acctp-list">
      <a class="acctp-row" href="admin.html"><span class="acctp-ico">${acctIcon('hospital')}</span><span class="acctp-label">Clinic sign-in</span><span class="acctp-chev">›</span></a>
    </div>`;
  }
  host.innerHTML = html;

  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('acctp-signin-btn', () => showSignin());
  on('acp-bookings', () => show('mybookings'));
  on('acp-track', () => { show('track'); const t = $('#bk-ref'); if (t) setTimeout(() => t.focus({ preventScroll: true }), 350); });
  on('acp-chat', () => { if (window.openChat) window.openChat(); });
  on('acp-privacy', () => window.open('privacy.html', '_blank', 'noopener'));
  on('acp-about', () => { const a = $('#acctp-about'); if (a) a.classList.toggle('hidden'); });
  on('acp-google', () => { location.href = '/api/auth/google/start'; });
  on('acp-logout', async () => { await logout(); show('account'); });
  on('acctp-edit-btn', () => { const b = $('#acctp-editbox'); if (b) b.classList.toggle('hidden'); });
  on('acctp-save', async () => {
    const err = $('#acctp-error');
    try {
      await api('/api/auth/profile', {
        method: 'POST',
        body: { name: $('#acctp-in-name').value.trim(), age: $('#acctp-in-age').value.trim() }
      });
      const { patient } = await api('/api/auth/me');
      state.patient = patient;
      toast('Details saved', 'info');
      renderAccountPage();
      renderAcctMenu();
    } catch (e2) { if (err) err.textContent = e2.message || 'Could not save'; }
  });
}

function renderSpecChips() {
  const specs = new Set();
  state.clinics.forEach(c => c.specialties.forEach(s => specs.add(s)));
  const host = $('#spec-chips');
  host.innerHTML = '';
  const mk = (label, active, fn) => {
    const b = document.createElement('button');
    b.className = 'chip' + (active ? ' active' : '');
    b.textContent = label;
    b.onclick = fn;
    host.appendChild(b);
  };
  mk('All', state.filter.specs.length === 0, () => { state.filter.specs = []; afterFilterChange(); });
  for (const s of [...specs]) {
    mk(s, state.filter.specs.includes(s), () => {
      const i = state.filter.specs.indexOf(s);
      if (i >= 0) state.filter.specs.splice(i, 1); else state.filter.specs.push(s);
      afterFilterChange();
    });
  }
}

function syncFchips(sel, key, val) { $$(sel + ' .fchip').forEach(b => b.classList.toggle('active', b.dataset[key] === val)); }
function afterFilterChange() { renderSpecChips(); renderActiveFilters(); renderBrowse(); }
function clearAllFilters() {
  const f = state.filter;
  f.q = ''; f.specs = []; f.area = 'All'; f.avail = 'all'; f.price = 'all'; f.sort = 'earliest';
  const si = $('#search-input'); if (si) si.value = '';
  const af = $('#area-filter'); if (af) af.value = 'All';
  syncFchips('#avail-chips', 'avail', 'all');
  syncFchips('#price-chips', 'price', 'all');
  const ss = $('#sort-select'); if (ss) ss.value = 'earliest';
  afterFilterChange();
}
function renderActiveFilters() {
  const f = state.filter;
  const host = $('#active-filters');
  if (!host) return;
  const items = [];
  f.specs.forEach(s => items.push({ label: s, clear: () => { f.specs = f.specs.filter(x => x !== s); } }));
  if (f.area !== 'All') items.push({ label: f.area, clear: () => { f.area = 'All'; const af = $('#area-filter'); if (af) af.value = 'All'; } });
  if (f.avail !== 'all') items.push({ label: { today: 'Today', tomorrow: 'Tomorrow', week: 'This week' }[f.avail], clear: () => { f.avail = 'all'; syncFchips('#avail-chips', 'avail', 'all'); } });
  if (f.price !== 'all') items.push({ label: { u300: 'Under \u20B9300', p350: '\u20B9300-500', p500: '\u20B9500+' }[f.price], clear: () => { f.price = 'all'; syncFchips('#price-chips', 'price', 'all'); } });
  if (f.sort !== 'earliest') items.push({ label: f.sort === 'price' ? 'Price: Low to High' : 'Nearest', clear: () => { f.sort = 'earliest'; const ss = $('#sort-select'); if (ss) ss.value = 'earliest'; } });
  host.classList.toggle('hidden', !items.length);
  host.innerHTML = items.map((it, i) => `<span class="af-chip">${esc(it.label)}<button type="button" class="af-x" data-i="${i}" aria-label="Remove filter">\u00D7</button></span>`).join('') + (items.length ? '<button type="button" class="af-clear" id="af-clear-all">Clear all</button>' : '');
  host.querySelectorAll('.af-x').forEach(b => b.onclick = () => { items[+b.dataset.i].clear(); afterFilterChange(); });
  const ca = $('#af-clear-all');
  if (ca) ca.onclick = clearAllFilters;
}

function filteredClinics() {
  const f = state.filter;
  const q = f.q.toLowerCase();
  const list = state.clinics.filter(c => {
    if (f.specs.length && !c.specialties.some(s => f.specs.includes(s))) return false;
    if (f.area !== 'All' && c.area !== f.area) return false;
    if (f.avail !== 'all') {
      const na = c.next_available;
      if (!na) return false;
      if (f.avail === 'today' && !na.today) return false;
      if (f.avail === 'tomorrow' && !na.tomorrow) return false;
      if (f.avail === 'week') {
        const t = new Date(Date.now() + 19800000);
        const start = t.toISOString().slice(0, 10);
        const end = new Date(t.getTime() + 6 * 86400000).toISOString().slice(0, 10);
        if (na.date < start || na.date > end) return false;
      }
    }
    if (f.price !== 'all') {
      const fee = c.min_fee;
      if (f.price === 'u300' && !(fee < 300)) return false;
      if (f.price === 'p350' && !(fee >= 300 && fee <= 500)) return false;
      if (f.price === 'p500' && !(fee > 500)) return false;
    }
    if (!q) return true;
    const hay = [c.name, c.area, c.tagline, c.specialties.join(' '), c.doctors.map(d => d.name + ' ' + d.specialty).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const rank = c => c.next_available ? (c.next_available.date + c.next_available.time) : '9999';
  if (f.sort === 'price') list.sort((a, b) => a.min_fee - b.min_fee);
  else if (f.sort === 'nearest' && state.geo) {
    const dist = c => { const co = CLINIC_COORDS[c.id]; if (!co) return 1e18; const dx = co[0] - state.geo[0], dy = co[1] - state.geo[1]; return dx * dx + dy * dy; };
    list.sort((a, b) => dist(a) - dist(b));
  } else list.sort((a, b) => rank(a).localeCompare(rank(b)) || a.name.localeCompare(b.name));
  return list;
}

function renderClinics() {
  const list = filteredClinics();
  const host = $('#clinic-list');
  if (!list.length) {
    host.innerHTML = `<div class="empty-state">
      <div class="empty-ico-disc">${uiIcon('search')}</div>
      <div class="empty-title">No clinics found</div>
      <div class="empty-sub">Try a different specialty, area, or price range.</div>
      <button type="button" class="btn btn-outline btn-small" id="clinic-clear">Try changing filters</button>
    </div>`;
    const clr = $('#clinic-clear');
    if (clr) clr.onclick = clearAllFilters;
  } else {
    host.innerHTML = list.map((c, i) => clinicCardHTML(c, i)).join('');
    bindClinicCards(host);
    watchReveals(host);
  }
  updateMapMarkers(list);
}

function renderBrowse() {
  if (state.browse === 'doctors') renderDoctorsBrowse();
  else renderClinics();
}

function renderDoctorsBrowse() {
  const host = $('#doctor-browse-list');
  if (!host) return;
  const q = state.filter.q.toLowerCase();
  const docs = [];
  for (const c of state.clinics) {
    if (state.filter.area !== 'All' && c.area !== state.filter.area) continue;
    for (const d of (c.doctors || [])) {
      if (state.filter.specs.length && !state.filter.specs.some(s => d.specialty === s || c.specialties.includes(s))) continue;
      if (q) {
        const hay = [d.name, d.specialty, d.qualification, c.name, c.area].join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      docs.push({ ...d, clinic_id: c.id, clinic_name: c.name, clinic_area: c.area });
    }
  }
  if (!docs.length) {
    host.innerHTML = `<div class="empty-state">
      <div class="empty-ico-disc">${uiIcon('pulse')}</div>
      <div class="empty-title">No doctors match that search</div>
      <div class="empty-sub">Try a different name, specialty, or clinic - or clear the search to see every doctor.</div>
      <button type="button" class="btn btn-outline btn-small" id="doc-clear">Clear search</button>
    </div>`;
    const dc = $('#doc-clear');
    if (dc) dc.onclick = clearAllFilters;
    return;
  }
  host.innerHTML = docs.map((d, i) => {
    const initials = '';
    return `
    <div class="clinic-card doc-browse-card reveal" style="--i:${Math.min(i, 9)}" data-clinic="${esc(d.clinic_id)}" role="button" tabindex="0" aria-label="View ${esc(d.name)} at ${esc(d.clinic_name)}">
      <div class="doc-browse-top">
        <div class="doc-avatar">${DOC_AVATAR_SVG}</div>
        <div>
          <div class="db-name">${esc(d.name)}</div>
          <div class="db-qual">${esc(d.qualification)}${d.experience_years ? ' · ' + d.experience_years + ' yrs exp' : ''}</div>
        </div>
      </div>
      <div class="spec-chips" style="margin-top:10px"><span class="spec-chip">${esc(d.specialty)}</span></div>
      <div class="doc-browse-clinic"><svg class="pin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M12 9v6M9 12h6"/></svg> ${esc(d.clinic_name)} · ${PIN_SVG} ${esc(d.clinic_area)}</div>
      <div class="doc-meta">${uiIcon('cal')} ${esc(d.days_label)} · ₹${d.fee}</div>
      ${fmtNext(d.next_available) ? `<div class="next-slot">Next slot: <b>${fmtNext(d.next_available)}</b></div>` : ''}
    </div>`;
  }).join('');
  host.querySelectorAll('.doc-browse-card').forEach(el => {
    const open = () => openClinic(el.dataset.clinic);
    el.onclick = open;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
  watchReveals(host);
}

/* ---------- MAP (OpenStreetMap + Leaflet) ---------- */
let map = null, mapMarkers = [];

/* desktop topnav (bound once at load; lives outside any view render) */
const topnav = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = e => { e.preventDefault(); fn(); }; };
topnav('topnav-home', () => show('home'));
topnav('topnav-bookings', () => show('mybookings'));
topnav('topnav-clinics', () => show('clinics'));

function setMapMode(mode) {
  state.mapMode = mode;
  document.querySelectorAll('#clinic-view-toggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.vt === mode));
  const listEl = $('#clinic-list'), mapEl = $('#clinic-map');
  if (mode === 'map') {
    listEl.classList.add('hidden');
    mapEl.classList.remove('hidden');
    initMap();
    updateMapMarkers(filteredClinics());
    if (map) setTimeout(() => map.invalidateSize(), 80);
  } else {
    mapEl.classList.add('hidden');
    listEl.classList.remove('hidden');
  }
}

function initMap() {
  if (map || typeof L === 'undefined') {
    if (typeof L === 'undefined') $('#clinic-map').innerHTML = '<div class="loading">Map could not load - check your connection.</div>';
    return;
  }
  map = L.map('clinic-map', { scrollWheelZoom: false }).setView([12.9716, 77.5946], 11);
  L.tileLayer('/api/tile?z={z}&x={x}&y={y}', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  map.on('popupopen', e => {
    const btn = e.popup.getElement().querySelector('.mc-open');
    if (btn) btn.onclick = () => { map.closePopup(); openClinic(btn.dataset.id); };
  });
}

function updateMapMarkers(list) {
  if (!map) return;
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];
  const pts = [];
  for (const c of list) {
    const co = CLINIC_COORDS[c.id];
    if (!co) continue;
    pts.push(co);
    const m = L.marker(co, {
      icon: L.divIcon({ className: 'dh-pin', html: '<span class="dh-pin-halo"></span><span class="dh-pin-mark">' + CLINIC_MARK_SVG + '</span>', iconSize: [40, 40], iconAnchor: [20, 37], popupAnchor: [0, -34] })
    }).addTo(map);
    m.bindPopup(`<div class="map-card">
      <div class="mc-name">${esc(c.name)}</div>
      <div class="mc-area">${PIN_SVG} ${esc(c.area)}</div>
      <div class="mc-meta">from ₹${c.min_fee}${fmtNext(c.next_available) ? ' · Next: ' + esc(fmtNext(c.next_available)) : ''}</div>
      <button type="button" class="mc-open" data-id="${esc(c.id)}">View clinic</button>
    </div>`);
    mapMarkers.push(m);
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
}

function clinicCardHTML(c, i) {
  return `
    <div class="clinic-card reveal" style="--i:${Math.min(i, 9)}" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="View ${esc(c.name)}">
      <div class="clinic-head">
        ${clinicMark(c)}
        <div>
          <div class="clinic-name">${esc(c.name)}</div>
          <div class="clinic-area">${PIN_SVG} ${esc(c.area)}</div>
        </div>
      </div>
      <div class="clinic-tagline">${esc(c.tagline || '')}</div>
      <div class="spec-chips">${c.specialties.map(s => `<span class="spec-chip">${esc(s)}</span>`).join('')}</div>
      <div class="clinic-foot">
        <span class="sample-badge">Sample clinic</span>
        <span class="fee">from ₹${c.min_fee}</span>
      </div>
      ${fmtNext(c.next_available) ? `<div class="next-slot">Next slot: <b>${fmtNext(c.next_available)}</b></div>` : ''}
      <button type="button" class="btn btn-small btn-block cc-book" data-book="${esc(c.id)}">Book Now</button>
    </div>`;
}

function bookClinicQuick(clinicId) {
  const c = state.clinics.find(x => x.id === clinicId);
  if (!c || !c.doctors || !c.doctors.length) { openClinic(clinicId); return; }
  const rank = d => (d.next_available && d.next_available.date + d.next_available.time) || '9999';
  const docs = c.doctors.slice().sort((a, b) => rank(a).localeCompare(rank(b)));
  openBooking(docs[0].id);
}

function bindClinicCards(host) {
  host.querySelectorAll('.clinic-card').forEach(el => {
    el.onclick = () => openClinic(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClinic(el.dataset.id); } };
  });
  host.querySelectorAll('.cc-book').forEach(b => b.onclick = e => { e.stopPropagation(); bookClinicQuick(b.dataset.book); });
}


/* ---------- featured clinics (home) ---------- */
function renderFeatured() {
  const host = $('#featured-grid');
  if (!host || !state.clinics.length) return;
  host.innerHTML = state.clinics.slice(0, 3).map((c, i) => {
    const next = fmtNext(c.next_available);
    const spec0 = (c.specialties || [])[0] || '';
    return `<article class="feat-card reveal" data-id="${c.id}" role="button" tabindex="0" aria-label="View ${esc(c.name)}">
      <div class="feat-visual">${clinicMark(c, 'feat-mark')}
        <span class="sample-tag feat-sample">Sample clinic</span>
        <span class="feat-arrow">${uiIcon('arrow')}</span>
        <div class="feat-pill">
          <div class="feat-name">${esc(c.name)}</div>
          <div class="feat-area">${uiIcon('pin')} ${esc(c.area)}${spec0 ? ' · ' + esc(spec0) : ''}</div>
          <div class="feat-meta"><span class="feat-fee">from ₹${c.min_fee}</span>${next ? `<span class="feat-next">${uiIcon('cal')} Next: ${esc(next)}</span>` : ''}</div>
        </div>
      </div>
    </article>`;
  }).join('');
  host.querySelectorAll('.feat-card').forEach(el => {
    el.onclick = () => openClinic(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClinic(el.dataset.id); } };
  });
  watchReveals(host);
}

/* ---------- hero video slot ----------
   Stays on the static hero unless /brand/hero-loop.mp4 actually exists.
   Lazy: HEAD-checks on idle, streams same-origin only after canplay.
   Reduced-motion users keep the static hero (it acts as the poster). */
(function heroVideo() {
  const v = $('#hero-video');
  if (!v) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const arm = () => {
    const isVideo = r => r && r.ok && (r.headers.get('content-type') || '').startsWith('video/');
    fetch('brand/hero-loop.mp4', { method: 'HEAD' }).then(r => {
      if (!isVideo(r)) return;
      const src = 'brand/hero-loop.mp4';
      v.addEventListener('canplay', () => {
        v.classList.add('ready');
        const scene = v.closest('.hero-scene');
        if (scene) scene.classList.add('video-on');
        v.play().catch(() => {});
      }, { once: true });
      v.addEventListener('error', () => v.remove(), { once: true });
      v.muted = true;
      v.src = src;
      v.load();
      v.play().catch(() => {});
      // pause off-screen / hidden tab to stay inside the Nord 2T budget
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(es => es.forEach(e => {
          if (v.src) { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }
        }), { threshold: 0.05 }).observe(v);
      }
      document.addEventListener('visibilitychange', () => {
        if (!v.src) return;
        if (document.hidden) v.pause(); else v.play().catch(() => {});
      });
    }).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(arm, { timeout: 3000 });
  else setTimeout(arm, 1500);
})();

/* ---------- sign-in ambient brand loop (self-generated asset) ---------- */
(function authVideo() {
  const v = $('#auth-video');
  if (!v) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const arm = () => {
    fetch('brand/brand-loop.mp4', { method: 'HEAD' }).then(r => {
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('video/')) return;
      v.addEventListener('canplay', () => {
        v.classList.add('ready');
        const scene = v.closest('.auth-scene');
        if (scene) scene.classList.add('video-on');
        v.play().catch(() => {});
      }, { once: true });
      v.addEventListener('error', () => v.remove(), { once: true });
      v.muted = true;
      v.src = 'brand/brand-loop.mp4';
      v.load();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(es => es.forEach(e => {
          if (v.src) { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }
        }), { threshold: 0.05 }).observe(v);
      }
      document.addEventListener('visibilitychange', () => {
        if (!v.src) return;
        if (document.hidden) v.pause(); else v.play().catch(() => {});
      });
    }).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(arm, { timeout: 3500 });
  else setTimeout(arm, 1800);
})();

/* ---------- scroll reveal (one-shot, transform/opacity only) ---------- */
const revealIO = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('revealed'); revealIO.unobserve(e.target); }
  }
}, { threshold: .1, rootMargin: '0px 0px -6% 0px' }) : null;

function watchReveals(root) {
  if (!revealIO || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    (root || document).querySelectorAll('.reveal').forEach(el => el.classList.add('revealed'));
    return;
  }
  // already above the viewport (deep link, scroll restore): reveal immediately
  (root || document).querySelectorAll('.reveal:not(.revealed)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0) el.classList.add('revealed');
  });
  (root || document).querySelectorAll('.reveal:not(.revealed):not([data-rv])').forEach(el => {
    el.dataset.rv = '1';
    const rawI = el.style.getPropertyValue('--i');
    const sibs = [...el.parentElement.children].filter(x => x.classList && x.classList.contains('reveal'));
    const idx = rawI !== '' ? parseFloat(rawI) : sibs.indexOf(el);
    el.style.transitionDelay = Math.min((isNaN(idx) ? 0 : idx) * 110, 660) + 'ms';
    revealIO.observe(el);
  });
  /* Safety net: if IntersectionObserver never fires (throttled tab, odd WebView),
     reveal everything after 4s so cards can never stay invisible. */
  clearTimeout(state.__revealFailsafe);
  state.__revealFailsafe = setTimeout(() => {
    document.querySelectorAll('.reveal:not(.revealed)').forEach(el => { el.style.transitionDelay = '0ms'; el.classList.add('revealed'); });
  }, 4000);
}

/* ---------- CLINIC DETAIL ---------- */
async function openClinic(id) {
  show('clinic');
  $('#clinic-detail').innerHTML = LOADER('Loading clinic&hellip;', 'cards');
  $('#doctor-list').innerHTML = '';
  $('#book-panel-host').innerHTML = '';
  try {
    const { clinic } = await api('/api/clinics/' + encodeURIComponent(id));
    state.clinic = clinic;
    recordRecentClinic(clinic);
    renderClinicDetail();
  } catch (e) {
    $('#clinic-detail').innerHTML = '<div class="loading">Clinic not found.</div>';
  }
}

/* Demo clinic locations (Bengaluru) for the map view. */
const CLINIC_COORDS = {
  'marathahalli-multispeciality': [12.9591, 77.6974],
  'motherhood-child-family': [12.9352, 77.6245],
  'orthoplus-bone-joint': [12.9116, 77.6474],
  'skinfirst-derma': [12.9719, 77.6412],
  'smilecare-dental': [12.9698, 77.7500]
};
const CLINIC_FACILITIES = {
  'marathahalli-multispeciality': ['AC waiting area', 'Pharmacy', 'Diagnostics lab', 'Wheelchair access'],
  'motherhood-child-family': ['AC waiting area', 'Pharmacy', 'Kids play corner', 'Vaccination room'],
  'orthoplus-bone-joint': ['AC waiting area', 'Physiotherapy suite', 'X-ray', 'Wheelchair access'],
  'skinfirst-derma': ['AC waiting area', 'Pharmacy', 'Procedure room'],
  'smilecare-dental': ['AC waiting area', 'Digital X-ray', 'Sterilization protocol', 'Wheelchair access']
};
function fmtDayPill(dateStr) {
  const ist = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  if (dateStr === ist) return 'Today';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

function renderClinicDetail() {
  const c = state.clinic;
  const tel = esc(c.phone.replace(/[^0-9+]/g, ''));
  const co = CLINIC_COORDS[c.id];
  const facilities = CLINIC_FACILITIES[c.id] || ['AC waiting area', 'Pharmacy'];
  const next = fmtNext(c.next_available);
  $('#clinic-detail').innerHTML = `
    <div class="detail-cover reveal"><div class="detail-cover-pattern"></div><div class="detail-cover-mark">${CLINIC_MARK_SVG}</div><div class="detail-cover-emoji">${c.emoji || ''}</div></div>
    <div class="detail-head reveal">
      <div class="detail-head-main">
        <h1 class="detail-name">${esc(c.name)}</h1>
        <div class="detail-addr">${PIN_SVG} ${esc(c.address)} <span class="sample-badge">Sample clinic</span></div>
        <div class="detail-badges"><span class="verified-badge">${uiIcon('shield')} Verified clinic</span></div>
      </div>
      <div class="detail-head-cta"><button type="button" class="btn" id="dt-book-top">Book Appointment</button><button type="button" class="btn btn-outline btn-save" id="dt-save">&#9825; Save</button></div>
    </div>
    <div class="quick-strip reveal">
      <div class="qs-item"><span class="qs-label">Open today</span><b>${esc(c.timings)}</b></div>
      <div class="qs-item"><span class="qs-label">Starting from</span><b>\u20B9${c.min_fee}</b></div>
      <div class="qs-item"><span class="qs-label">Next available</span><b>${next ? esc(next) : 'No slots in 14 days'}</b></div>
    </div>
    <div class="detail-tabs reveal" id="detail-tabs">
      <button type="button" class="dtab active" data-dtab="about">About</button>
      <button type="button" class="dtab" data-dtab="doctors">Doctors</button>
      <button type="button" class="dtab" data-dtab="slots">Slots</button>
      <button type="button" class="dtab" data-dtab="location">Location</button>
    </div>
    <div class="dt-panel" id="dt-about">
      <div class="info-card">
        <p class="dt-desc">${esc(c.tagline || '')}</p>
        <h3 class="dt-h">Specialties</h3>
        <div class="spec-chips">${c.specialties.map(s => `<span class="spec-chip">${esc(s)}</span>`).join('')}</div>
        <h3 class="dt-h">Facilities</h3>
        <div class="fac-list">${facilities.map(f => `<span class="fac-item">${uiIcon('check')}${esc(f)}</span>`).join('')}</div>
        <h3 class="dt-h">Contact</h3>
        <div class="info-row"><span class="info-ico">${uiIcon('phone')}</span><span><a href="tel:${tel}">${esc(c.phone)}</a></span></div>
      </div>
    </div>
    <div class="dt-panel hidden" id="dt-doctors"></div>
    <div class="dt-panel hidden" id="dt-slots"></div>
    <div class="dt-panel hidden" id="dt-location">
      ${co ? `<div class="detail-map-card"><div id="detail-map"></div></div>` : ''}
      <div class="info-card" style="margin-top:12px">
        <div class="info-row"><span class="info-ico">${PIN_SVG}</span><span><b>Address</b><br>${esc(c.address)}</span></div>
        ${co ? `<a class="btn btn-outline btn-small" style="margin-top:10px" href="https://www.google.com/maps/search/?api=1&query=${co[0]}%2C${co[1]}" target="_blank" rel="noopener">Get Directions →</a>` : ''}
      </div>
    </div>
    <div class="sticky-book" id="sticky-book">
      <div class="sb-fee">Starting <b>\u20B9${c.min_fee}</b></div>
      <button type="button" class="btn" id="sb-book">Book Appointment</button>
    </div>`;
  $('#doctor-list').innerHTML = '';
  $('#dt-doctors').innerHTML = c.doctors.map(d => `
    <div class="doctor-card reveal">
      <div class="doc-avatar">${DOC_AVATAR_SVG}</div>
      <div class="doc-info">
        <div class="doc-name">${esc(d.name)}</div>
        <div class="doc-spec">${esc(d.specialty)}</div>
        <div class="doc-meta">${esc(d.qualification)} · ${d.experience_years} yrs experience</div>
        <div class="doc-meta">${uiIcon('cal')} ${esc(d.days_label)}${d.next_available ? ` · <span class="doc-next">Next: ${fmtNext(d.next_available)}</span>` : ' · <span style="color:var(--amber)">No slots in 14 days</span>'}</div>
      </div>
      <div class="doc-right">
        <div class="doc-fee">\u20B9${d.fee} <small>consult</small></div>
        <button class="btn btn-small" data-doc="${esc(d.id)}">Book with this doctor</button>
        <button class="doc-more" data-docinfo="${esc(d.id)}">Details</button>
      </div>
    </div>`).join('');
  $('#dt-doctors').querySelectorAll('button[data-doc]').forEach(b => { b.onclick = () => openBooking(b.dataset.doc); });
  $('#dt-doctors').querySelectorAll('button[data-docinfo]').forEach(b => { b.onclick = () => openDoctorModal(b.dataset.docinfo); });
  let mapInit = false, slotsInit = false;
  $$('#detail-tabs .dtab').forEach(b => b.onclick = () => {
    $$('#detail-tabs .dtab').forEach(x => x.classList.toggle('active', x === b));
    ['about', 'doctors', 'slots', 'location'].forEach(k => $('#dt-' + k).classList.toggle('hidden', k !== b.dataset.dtab));
    if (b.dataset.dtab === 'location' && !mapInit) { mapInit = true; initDetailMap(c); }
    if (b.dataset.dtab === 'slots' && !slotsInit) { slotsInit = true; renderSlotsTab(c); }
  });
  const bookTop = () => bookClinicQuick(c.id);
  $('#dt-book-top').onclick = bookTop;
  const dtSave = $('#dt-save');
  if (dtSave) { dtSave.onclick = () => { toggleSaveClinic(state.clinic); updateSaveBtn(); }; updateSaveBtn(); }
  $('#sb-book').onclick = bookTop;
  watchReveals($('#clinic-detail'));
  watchReveals($('#dt-doctors'));
}

async function renderSlotsTab(c) {
  const host = $('#dt-slots');
  const days = [];
  const now = new Date(Date.now() + 19800000);
  for (let i = 0; i < 10; i++) days.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10));
  host.innerHTML = `
    <div class="slot-doc-filter"><select id="slot-doc" class="fb-select" aria-label="Filter by doctor">
      <option value="all">All doctors</option>
      ${c.doctors.map(d => `<option value="${esc(d.id)}">${esc(d.name)} - ${esc(d.specialty)}</option>`).join('')}
    </select></div>
    <div class="slot-dates" id="slot-dates">${days.map((d, i) => `<button type="button" class="date-pill${i === 0 ? ' active' : ''}" data-date="${d}">${fmtDayPill(d)}</button>`).join('')}</div>
    <div class="slot-grid" id="slot-grid">${LOADER('Finding open slots&hellip;', 'slots')}</div>`;
  const st = { date: days[0], docId: 'all' };
  const load = async () => {
    const grid = $('#slot-grid');
    const oldBar = $('#slot-book-bar'); if (oldBar) oldBar.remove();
    grid.innerHTML = LOADER('Finding open slots&hellip;', 'slots');
    const docs = st.docId === 'all' ? c.doctors : c.doctors.filter(d => d.id === st.docId);
    const results = await Promise.all(docs.map(d =>
      api('/api/slots?doctor_id=' + encodeURIComponent(d.id) + '&date=' + st.date)
        .then(r => ({ d, slots: r.slots || [] }))
        .catch(() => ({ d, slots: [] }))
    ));
    const byTime = {};
    for (const { d, slots } of results) for (const s of slots) {
      if (!byTime[s.time]) byTime[s.time] = { available: false, docId: null };
      if (s.available) {
        if (!byTime[s.time].available) byTime[s.time].docId = d.id;
        byTime[s.time].available = true;
      }
    }
    const times = Object.keys(byTime).sort();
    if (!times.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-ico-disc">' + uiIcon('cal') + '</div><div class="empty-title">No slots this day</div><div class="empty-sub">Try another date.</div></div>';
      return;
    }
    grid.innerHTML = times.map(t => `<button type="button" class="slot-btn${byTime[t].available ? '' : ' taken'}" data-time="${t}" ${byTime[t].available ? '' : 'disabled'}>${fmtTime(t)}</button>`).join('');
    grid.querySelectorAll('.slot-btn:not(.taken)').forEach(b => b.onclick = () => {
      grid.querySelectorAll('.slot-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const docId = byTime[b.dataset.time].docId;
      const old = $('#slot-book-bar'); if (old) old.remove();
      const bar = document.createElement('div');
      bar.id = 'slot-book-bar';
      bar.className = 'slot-book-bar';
      bar.innerHTML = `<span class="sbb-label">${fmtDate(st.date)} · ${fmtTime(b.dataset.time)}</span><button type="button" class="btn btn-small" id="slot-book-go">Book this slot</button>`;
      grid.after(bar);
      $('#slot-book-go').onclick = () => openBooking(docId, { date: st.date, slot: b.dataset.time });
    });
  };
  $('#slot-doc').onchange = e => { st.docId = e.target.value; load(); };
  host.querySelectorAll('.date-pill').forEach(b => b.onclick = () => {
    host.querySelectorAll('.date-pill').forEach(x => x.classList.toggle('active', x === b));
    st.date = b.dataset.date;
    load();
  });
  load();
}

/* ---------- clinic detail mini map (same-origin tiles) ---------- */
let detailMap = null;
function initDetailMap(c) {
  const el = document.getElementById('detail-map');
  const co = CLINIC_COORDS[c.id];
  if (!el || !co || typeof L === 'undefined') return;
  if (detailMap) { detailMap.remove(); detailMap = null; }
  detailMap = L.map('detail-map', { scrollWheelZoom: false, attributionControl: false, zoomControl: false }).setView(co, 15);
  L.control.zoom({ position: 'bottomright' }).addTo(detailMap);
  L.tileLayer('/api/tile?z={z}&x={x}&y={y}', { maxZoom: 18 }).addTo(detailMap);
  L.circle(co, { radius: 400, color: '#1068FC', weight: 1.5, opacity: .5, fillColor: '#1068FC', fillOpacity: .07 }).addTo(detailMap);
  L.circle(co, { radius: 170, color: '#1068FC', weight: 1, opacity: .35, fillColor: '#1068FC', fillOpacity: .10 }).addTo(detailMap);
  L.marker(co, {
    icon: L.divIcon({ className: 'dh-pin dh-pin-hero', html: '<span class="dh-pin-halo"></span><span class="dh-pin-mark">' + CLINIC_MARK_SVG + '</span>', iconSize: [52, 52], iconAnchor: [26, 49] })
  }).addTo(detailMap);
  setTimeout(() => detailMap && detailMap.invalidateSize(), 80);
}

/* ---------- doctor profile modal ---------- */
function openDoctorModal(doctorId) {
  const d = state.clinic.doctors.find(x => x.id === doctorId);
  if (!d) return;
  closeDoctorModal();
  const ov = document.createElement('div');
  ov.className = 'doc-modal-overlay'; ov.id = 'doc-modal-overlay';
  ov.innerHTML = `
    <div class="doc-modal" role="dialog" aria-modal="true" aria-label="Doctor profile">
      <button class="modal-close" id="dm-close" aria-label="Close">✕</button>
      <div class="doc-modal-head">
        <div class="doc-avatar">${DOC_AVATAR_SVG}</div>
        <div>
          <div class="doc-name" style="font-size:19px">${esc(d.name)}</div>
          <div class="doc-spec">${esc(d.specialty)}</div>
          <div class="doc-meta">${esc(d.qualification)}</div>
        </div>
      </div>
      <div class="doc-modal-grid">
        <div class="doc-modal-cell"><div class="k">Experience</div><div class="v">${d.experience_years} years</div></div>
        <div class="doc-modal-cell"><div class="k">Consult fee</div><div class="v">₹${d.fee}</div></div>
        <div class="doc-modal-cell"><div class="k">Available</div><div class="v">${esc(d.days_label)}</div></div>
        <div class="doc-modal-cell"><div class="k">Next slot</div><div class="v">${d.next_available ? esc(fmtNext(d.next_available)) : 'Not in 14 days'}</div></div>
      </div>
      <div class="doc-modal-about">${esc(d.name)} is a ${esc(d.specialty.toLowerCase())} at ${esc(state.clinic.name)} with ${d.experience_years} years of experience. Consultation is ₹${d.fee}, pay at the clinic. Speaks English, Hindi and Kannada.</div>
      <button class="btn btn-block" id="dm-book">Book appointment →</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) closeDoctorModal(); });
  $('#dm-close').onclick = closeDoctorModal;
  $('#dm-book').onclick = () => { closeDoctorModal(); openBooking(doctorId); };
}
function closeDoctorModal() {
  const m = document.getElementById('doc-modal-overlay');
  if (m) m.remove();
}

/* ---------- BOOKING WIZARD (v7) ---------- */
const WIZ_STEPS = ['slot', 'details'];
const WIZ_LABELS = { slot: 'Select slot', details: 'Your details' };

function openBooking(doctorId, pre) {
  /* resolve the doctor's clinic even when opened straight from a browse card,
     where state.clinic is null or a different clinic */
  let doctor = state.clinic && state.clinic.doctors ? state.clinic.doctors.find(d => d.id === doctorId) : null;
  if (!doctor) {
    const c = state.clinics.find(x => (x.doctors || []).some(d => d.id === doctorId));
    if (c) state.clinic = c;
    doctor = c ? c.doctors.find(d => d.id === doctorId) : null;
  }
  if (!doctor) { toast('Could not start booking - please reopen the clinic and try again.', 'error'); return; }
  state.booking = { doctor, date: pre && pre.date ? pre.date : null, slot: pre && pre.slot ? pre.slot : null, step: 'slot' };
  if (state.patient) {
    if (state.patient.name) state.booking.pname = state.patient.name;
    if (state.patient.phone) state.booking.pphone = state.patient.phone;
    if (state.patient.age != null) state.booking.page = state.patient.age;
  }
  if (state.bookingFor) {
    state.booking.pname = state.bookingFor.name;
    if (state.bookingFor.age != null) state.booking.page = state.bookingFor.age;
    if (state.bookingFor.gender) state.booking.pgender = state.bookingFor.gender;
  }
  closeWizard();
  const ov = document.createElement('div');
  ov.id = 'wizard-overlay';
  ov.innerHTML = `
    <div class="wizard" role="dialog" aria-modal="true" aria-label="Book appointment">
      <div class="wiz-head">
        <div class="doc-avatar wiz-avatar">${DOC_AVATAR_SVG}</div>
        <div class="wiz-head-info">
          <div class="wiz-doc">${esc(doctor.name)}</div>
          <div class="wiz-doc-sub">${esc(doctor.specialty)} · ${esc(state.clinic.name)}</div>
        </div>
        <div class="wiz-fee">₹${doctor.fee}<span> consult</span></div>
        <button class="book-close" id="wiz-close" aria-label="Close">✕</button>
      </div>
      <div class="wiz-progress" id="wiz-progress"></div>
      <div class="wiz-live" id="wiz-live"></div>
      <div class="wiz-steps" id="wiz-steps"></div>
      <div class="wiz-foot">
        <button class="btn-ghost btn wiz-back" id="wiz-back">← Back</button>
        <button class="btn wiz-next" id="wiz-next" disabled>Continue →</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  document.body.classList.add('wiz-open');
  ov.addEventListener('click', e => { if (e.target === ov) closeWizard(); });
  $('#wiz-close').onclick = closeWizard;
  $('#wiz-back').onclick = wizBack;
  $('#wiz-next').onclick = wizNext;
  document.addEventListener('keydown', wizEsc);
  renderWizard('none');
}

function closeWizard() {
  const ov = document.getElementById('wizard-overlay');
  if (ov) ov.remove();
  document.body.classList.remove('wiz-open');
  document.removeEventListener('keydown', wizEsc);
}
function wizEsc(e) { if (e.key === 'Escape') closeWizard(); }

function wizRenderProgress() {
  const cur = WIZ_STEPS.indexOf(state.booking.step);
  const host = $('#wiz-progress');
  host.innerHTML = WIZ_STEPS.map((s, i) => {
    const cls = i < cur ? 'done' : i === cur ? 'active' : '';
    const icon = i < cur ? '✓' : (i + 1);
    return `${i ? '<div class="wiz-line' + (i <= cur ? ' fill' : '') + '"></div>' : ''}
      <div class="wiz-node ${cls}" data-step="${s}"><div class="wiz-dot">${icon}</div><div class="wiz-lbl">${WIZ_LABELS[s]}</div></div>`;
  }).join('');
}

function wizRenderLive() {
  const { doctor, date, slot } = state.booking;
  const chip = (icon, val, set) => `<div class="wiz-chip ${set ? 'set' : ''}">${icon} ${set ? esc(val) : '<span class="wiz-chip-ph">—</span>'}</div>`;
  $('#wiz-live').innerHTML =
    chip(uiIcon('cal'), date ? fmtDateShort(date) : '', !!date) +
    chip(uiIcon('clock'), slot ? fmtTime(slot) : '', !!slot) +
    chip(uiIcon('card'), '₹' + doctor.fee + ' at clinic', true);
}

function renderWizard(dir) {
  wizRenderProgress();
  wizRenderLive();
  const { step } = state.booking;
  const host = $('#wiz-steps');
  const anim = dir === 'back' ? 'stepInL' : dir === 'none' ? 'stepFade' : 'stepInR';
  if (step === 'slot') host.innerHTML = wizSlotHTML();
  else host.innerHTML = wizDetailsHTML();
  const el = host.firstElementChild;
  if (el) { el.classList.add('wiz-step'); el.style.animation = anim + ' .34s cubic-bezier(.22,.61,.36,1) both'; }
  if (step === 'slot') wireWizSlot();
  if (step === 'details') wireWizDetails();
  wizRenderFoot();
}

function wizRenderFoot() {
  const { step, date, slot } = state.booking;
  const back = $('#wiz-back'), next = $('#wiz-next');
  back.style.visibility = step === 'slot' ? 'hidden' : 'visible';
  next.style.display = '';
  if (step === 'details') {
    next.classList.add('wiz-confirm');
    next.disabled = false;
    next.innerHTML = '✓ Confirm Booking';
    next.onclick = () => { if (wizValidate(true)) submitBooking(); };
    return;
  }
  next.classList.remove('wiz-confirm');
  next.onclick = wizNext;
  next.disabled = !date || !slot;
  next.innerHTML = 'Continue →';
}

function wizGoto(step, dir) {
  state.booking.step = step;
  renderWizard(dir || 'fwd');
}
function wizBack() {
  const i = WIZ_STEPS.indexOf(state.booking.step);
  if (i > 0) wizGoto(WIZ_STEPS[i - 1], 'back');
}
function wizNext() {
  const { step } = state.booking;
  if (step === 'slot' && state.booking.date && state.booking.slot) wizGoto('details');
}

/* --- step: slot (calendar + time pills on one step) --- */
function wizSlotHTML() {
  const days = [];
  const now = new Date(Date.now() + 19800000);
  for (let i = 0; i < 14; i++) days.push(new Date(now.getTime() + i * 86400000).toISOString().slice(0, 10));
  return `<div>
    <div class="wiz-step-title">Select a slot</div>
    <div class="wiz-step-sub">Pick a day and time at ${esc(state.clinic.name)}</div>
    <div class="date-row wiz-date-row" id="wiz-date-row">` +
    days.map((iso, i) => {
      const d = new Date(iso + 'T00:00:00Z');
      return `<button class="date-pill${state.booking.date === iso ? ' active' : ''}" data-iso="${iso}">
        <div class="dow">${i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</div>
        <div class="dnum">${d.getUTCDate()}</div>
        <div class="dow">${d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</div></button>`;
    }).join('') + `</div>
    <div id="wiz-slot-host"><div class="wiz-slot-hint">Pick a day to see open times</div></div>
  </div>`;
}
function wireWizSlot() {
  $('#wiz-date-row').querySelectorAll('.date-pill').forEach(b => {
    b.onclick = () => {
      if (state.booking.date !== b.dataset.iso) state.booking.slot = null;
      state.booking.date = b.dataset.iso;
      $('#wiz-date-row').querySelectorAll('.date-pill').forEach(p => p.classList.toggle('active', p === b));
      wizRenderLive();
      wizRenderFoot();
      loadWizSlots();
    };
  });
  if (state.booking.date) loadWizSlots();
}
async function loadWizSlots() {
  const { doctor, date } = state.booking;
  const host = $('#wiz-slot-host');
  if (!host || !date) return;
  host.innerHTML = '<div class="slot-grid">' + '<div class="skel skel-slot"></div>'.repeat(8) + '</div>';
  try {
    const { slots } = await api(`/api/slots?doctor_id=${encodeURIComponent(doctor.id)}&date=${date}`);
    if (state.booking.step !== 'slot' || state.booking.date !== date) return;
    if (!slots.length) {
      host.innerHTML = `<div class="empty-note">Doctor is not available on ${esc(fmtDate(date))}. Pick another day above.</div>`;
      return;
    }
    const firstOpen = slots.find(s => s.available);
    let si = 0;
    let html = `<div class="wiz-slots-title">${esc(fmtDate(date))} · ${slots.filter(s => s.available).length} of ${slots.length} open</div>`;
    const groups = [['Morning', s => +s.time.slice(0, 2) < 12], ['Afternoon', s => +s.time.slice(0, 2) >= 12 && +s.time.slice(0, 2) < 17], ['Evening', s => +s.time.slice(0, 2) >= 17]];
    for (const [label, match] of groups) {
      const g = slots.filter(match);
      if (!g.length) continue;
      html += `<div class="slot-group-label">${label}</div><div class="slot-grid">` + g.map(s => {
        const isNext = firstOpen && s.time === firstOpen.time;
        return `<button class="slot-btn ${isNext ? 'slot-next' : ''}${state.booking.slot === s.time ? ' active' : ''}" data-time="${s.time}" ${s.available ? '' : 'disabled'}
          style="animation-delay:${(si++ * 18)}ms">${fmtTime(s.time)}${isNext ? '<span class="slot-next-tag">next</span>' : ''}${s.available ? '' : '<span class="slot-taken-tag">taken</span>'}</button>`;
      }).join('') + '</div>';
    }
    if (!slots.some(s => s.available)) html += '<div class="empty-note">All slots are taken for this day. Pick another day above.</div>';
    host.innerHTML = html;
    host.querySelectorAll('.slot-btn:not(:disabled)').forEach(b => {
      b.onclick = () => {
        state.booking.slot = b.dataset.time;
        host.querySelectorAll('.slot-btn').forEach(x => x.classList.toggle('active', x === b));
        wizRenderLive();
        wizRenderFoot();
      };
    });
  } catch (e) {
    host.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
  }
}

/* --- step: time (rich slot picker) --- */
/* --- step: details --- */
function wizDetailsHTML() {
  const b = state.booking;
  const v = id => String(b[id] == null ? '' : b[id]).replace(/"/g, '&quot;');
  return `<div>
    <div class="wiz-step-title">Your details</div>
    <div class="wiz-step-sub">For ${esc(b.doctor.name)} · ${esc(fmtDateShort(b.date))} · ${fmtTime(b.slot)}</div>
    <div class="form-grid">
      ${state.bookingFor ? `<div class="for-member">Booking for <b>${esc(state.bookingFor.name)}</b>${state.bookingFor.relation ? ' (' + esc(state.bookingFor.relation) + ')' : ''} · from your account. <button type="button" class="linklike" id="wz-for-clear">Book for myself instead</button></div>` : ''}
      <div class="form-row"><label for="wz-name">Full Name</label><input id="wz-name" placeholder="Full name" maxlength="60" autocomplete="name" value="${v('pname')}"></div>
      <div class="form-row"><label for="wz-phone">Mobile Number</label>
        <div class="phone-wrap"><span class="phone-prefix">+91</span><input id="wz-phone" placeholder="98765 43210" inputmode="numeric" maxlength="10" autocomplete="tel-national" value="${v('pphone')}"></div>
      </div>
      <div class="form-2col">
        <div class="form-row"><label for="wz-age">Age</label><input id="wz-age" placeholder="Age" inputmode="numeric" maxlength="3" value="${v('page')}"></div>
        <div class="form-row"><label for="wz-gender">Gender</label><select id="wz-gender" class="wz-select">
          <option value="">Select</option>
          <option value="Female" ${b.pgender === 'Female' ? 'selected' : ''}>Female</option>
          <option value="Male" ${b.pgender === 'Male' ? 'selected' : ''}>Male</option>
          <option value="Other" ${b.pgender === 'Other' ? 'selected' : ''}>Other</option>
        </select></div>
      </div>
      <div class="form-row"><label for="wz-concern">Symptoms / notes <span style="color:var(--muted);font-weight:400">(optional)</span></label><textarea id="wz-concern" rows="2" placeholder="e.g. fever since 2 days" maxlength="300">${esc(b.pconcern || '')}</textarea></div>
      <div class="consent-row">By confirming, you agree to Drayvenn Health storing your name, mobile number and booking details so the clinic can manage this appointment, as described in the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. You can ask for your data to be deleted anytime.</div>
      <div class="form-note" style="text-align:center;margin-top:2px">No payment now - pay \u20B9${b.doctor.fee} at the clinic. The clinic confirms your slot shortly.</div>
      <div class="form-error" id="wz-error"></div>
    </div></div>`;
}
function wireWizDetails() {
  const fc = $('#wz-for-clear');
  if (fc) fc.onclick = () => {
    state.bookingFor = null;
    const p = state.patient || {};
    $('#wz-name').value = p.name || '';
    $('#wz-age').value = p.age != null ? p.age : '';
    $('#wz-gender').value = '';
    fc.closest('.for-member').remove();
  };
  $('#wz-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  $('#wz-age').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });
  $('#wiz-next').disabled = false;
}
function wizValidate(showErr) {
  const name = $('#wz-name').value.trim();
  const phone = $('#wz-phone').value.trim();
  const age = $('#wz-age').value.trim();
  const concern = $('#wz-concern').value.trim();
  const gender = $('#wz-gender') ? $('#wz-gender').value : '';
  Object.assign(state.booking, { pname: name, pphone: phone, page: age, pconcern: concern, pgender: gender });
  const err = $('#wz-error');
  let msg = '';
  if (name.length < 2) msg = 'Please enter the patient name.';
  else if (!/^[6-9]\d{9}$/.test(phone)) msg = 'Please enter a valid 10-digit mobile number.';
  else if (age && (+age < 0 || +age > 120)) msg = 'Please enter a valid age.';
  if (msg && showErr) { err.textContent = msg; err.style.display = 'block'; $('#wiz-steps').querySelector('.wiz-step').style.animation = 'stepShake .3s ease'; }
  if (!msg) err.style.display = 'none';
  return !msg;
}

/* --- step: review --- */
function wizReviewHTML() {
  const b = state.booking;
  const row = (k, v) => `<div class="wiz-review-row"><span>${k}</span><b>${esc(v)}</b></div>`;
  return `<div>
    <div class="wiz-step-title">Review & confirm</div>
    <div class="wiz-step-sub">No payment now - pay ₹${b.doctor.fee} at the clinic.</div>
    <div class="wiz-review-card">
      ${row('Patient', b.pname + (b.page ? ' · ' + b.page + ' yrs' : ''))}
      ${row('Mobile', '+91 ' + b.pphone)}
      ${row('Doctor', b.doctor.name + ' (' + b.doctor.specialty + ')')}
      ${row('Clinic', state.clinic.name)}
      ${row('When', fmtDate(b.date) + ' · ' + fmtTime(b.slot))}
      ${b.pconcern ? row('Concern', b.pconcern) : ''}
      <div class="wiz-review-row wiz-review-total"><span>Consult fee</span><b>₹${b.doctor.fee} <span class="wiz-pay-note">pay at clinic</span></b></div>
    </div>
    <div class="consent-row">By confirming, you agree to Drayvenn Health storing your name, mobile number and booking details so the clinic can manage this appointment, as described in the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. You can ask for your data to be deleted anytime.</div>
    <div class="form-error" id="bk-error2"></div>
    <div class="form-note" style="text-align:center;margin-top:2px">The clinic confirms your slot shortly.</div></div>`;
}
function wireWizReview() {
  /* No checkbox gate: the confirm button is always live, consent sits as a
     plain line above it (Practo-style). A disabled final button read as
     "booking is broken" on phones. */
  const btn = $('#wiz-next');
  if (btn) btn.disabled = false;
}

async function submitBooking() {
  const err = $('#wz-error');
  err.style.display = 'none';
  const b = state.booking;
  const btn = $('#wiz-next');
  btn.disabled = true;
  btn.innerHTML = 'Booking<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  try {
    const { booking } = await api('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: state.clinic.id,
        doctor_id: b.doctor.id,
        patient_name: b.pname,
        phone: b.pphone, age: b.page, gender: b.pgender || null, concern: b.pconcern,
        date: b.date, slot: b.slot, consent: true
      })
    });
    state.lastBooking = booking;
    state.bookingFor = null;
    closeWizard();
    renderConfirmation(booking);
    show('confirm');
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
    toast(e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '✓ Confirm Booking';
  }
}

/* ---------- CONFIRMATION ---------- */
function gcalLink(b) {
  const dt = b.date.replace(/-/g, '') + 'T' + b.slot.replace(':', '') + '00';
  const [h, m] = b.slot.split(':').map(Number);
  const endMin = h * 60 + m + 30;
  const end = b.date.replace(/-/g, '') + 'T' + String(Math.floor(endMin / 60)).padStart(2, '0') + String(endMin % 60).padStart(2, '0') + '00';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Appointment: ${b.doctor_name} - ${b.clinic_name}`,
    dates: dt + '/' + end,
    details: `Booking ref ${b.ref} · Patient ${b.patient_name}${b.fee ? ' · Fee ₹' + b.fee : ''} (pay at clinic) · Booked via Drayvenn Health`,
    location: b.clinic_address
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function confettiBurst() {
  const host = document.getElementById('view-confirm');
  if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#0d9488', '#14b8a6', '#1e3a5f', '#f59e0b', '#22c55e', '#99f6e4'];
  for (let i = 0; i < 26; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    const ang = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 190;
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist - 140 + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    p.style.setProperty('--dur', (0.9 + Math.random() * 0.8) + 's');
    p.style.background = colors[i % colors.length];
    if (i % 3 === 0) p.style.borderRadius = '50%';
    if (i % 4 === 0) p.style.width = '6px', p.style.height = '12px';
    host.appendChild(p);
    setTimeout(() => p.remove(), 2400);
  }
}

function renderConfirmation(b) {
  setTimeout(confettiBurst, 250);
  $('#confirm-sub').textContent = `${b.clinic_name} will confirm your slot shortly. Save your booking reference.`;
  $('#confirm-ref').innerHTML = `Booking ID <b>${esc(b.ref)}</b>`;
  $('#wa-bubble').innerHTML = `
    <div class="wa-head">Drayvenn Health · Appointment booked</div>
    <div class="wa-row"><span class="k">Patient</span><span class="v">${esc(b.patient_name)}${b.age ? ' · ' + esc(b.age) + ' yrs' : ''}</span></div>
    <div class="wa-row"><span class="k">Doctor</span><span class="v">${esc(b.doctor_name)}</span></div>
    <div class="wa-row"><span class="k">Clinic</span><span class="v">${esc(b.clinic_name)}</span></div>
    <div class="wa-row"><span class="k">Address</span><span class="v">${esc(b.clinic_address || '')}</span></div>
    <div class="wa-row"><span class="k">Date</span><span class="v">${fmtDate(b.date)}</span></div>
    <div class="wa-row"><span class="k">Time</span><span class="v">${fmtTime(b.slot)}</span></div>
    <div class="wa-row"><span class="k">Consult fee</span><span class="v">₹${b.fee} (pay at clinic)</span></div>
    <div class="wa-ref">Ref: ${esc(b.ref)}</div>
    <div style="font-size:12px;color:#4b6b64;margin-top:8px">Show this message at the clinic front desk. Status: <b>Pending clinic confirmation</b>.</div>
    <div class="wa-time">${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} ✓✓</div>`;
  const cal = $('#confirm-cal');
  cal.href = gcalLink(b);
  cal.classList.remove('hidden');
}

/* ---------- MANAGE BOOKING (ref + phone) ---------- */
let bkPhone = '';

async function lookupBooking() {
  const err = $('#bk-error');
  err.style.display = 'none';
  const ref = $('#bk-ref').value.trim().toUpperCase();
  const phone = $('#bk-phone').value.trim();
  const host = $('#bk-result');
  host.innerHTML = '';
  if (!ref || !/^[6-9]\d{9}$/.test(phone)) {
    err.textContent = 'Enter the booking reference and a valid 10-digit mobile number.';
    err.style.display = 'block';
    return;
  }
  try {
    const { booking: b } = await api(`/api/bookings/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone)}`);
    bkPhone = phone;
    renderManageBooking(b);
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
}

function renderManageBooking(b) {
  const host = $('#bk-result');
  const stepIdx = b.status === 'pending' ? 0 : b.status === 'confirmed' ? 1 : -1;
  const upcoming = b.status !== 'cancelled' && b.date >= toISODate(new Date());
  host.innerHTML = `
    <div class="track-result">
      ${stepIdx >= 0 ? `<div class="track-steps">
        <div class="tstep done"><div class="tdot"></div>Booked</div>
        <div class="tline ${stepIdx >= 1 ? 'done' : ''}"></div>
        <div class="tstep ${stepIdx >= 1 ? 'done' : ''}"><div class="tdot"></div>Confirmed</div>
      </div>
      ${stepIdx === 0 ? '<div class="track-note">Waiting for clinic confirmation</div>' : ''}
      ${stepIdx === 1 ? '<div class="track-note track-note-ok">Confirmed - show your booking reference at the clinic</div>' : ''}` : `<div style="text-align:center;margin-bottom:10px"><span class="status-badge status-cancelled">Cancelled</span></div>`}
      <div class="wa-row"><span class="k">Patient</span><span class="v">${esc(b.patient_name)}</span></div>
      <div class="wa-row"><span class="k">Doctor</span><span class="v">${esc(b.doctor_name)} (${esc(b.specialty)})</span></div>
      <div class="wa-row"><span class="k">Clinic</span><span class="v">${esc(b.clinic_name)}, ${esc(b.clinic_area)}</span></div>
      ${b.status === 'confirmed' && b.clinic_address ? `<div class="wa-row"><span class="k">Address</span><span class="v">${esc(b.clinic_address)}</span></div>` : ''}
      <div class="wa-row"><span class="k">Date & time</span><span class="v">${fmtDate(b.date)}, ${fmtTime(b.slot)}</span></div>
      <div class="wa-row"><span class="k">Fee</span><span class="v">₹${b.fee} (pay at clinic)</span></div>
      <div class="wa-row"><span class="k">Reference</span><span class="v"><b>${esc(b.ref)}</b></span></div>
      ${b.status === 'confirmed' ? '<div style="margin-top:10px;font-size:13px;color:var(--green);font-weight:600">Your slot is confirmed. Please reach 5 minutes early.</div>' : ''}
      ${b.status === 'pending' ? '<div style="margin-top:10px;font-size:13px;color:var(--amber);font-weight:600">The clinic is confirming your slot. Check again in a little while.</div>' : ''}
      ${b.status === 'cancelled' ? `<div style="margin-top:10px;font-size:13px;color:var(--red);font-weight:600">This booking was cancelled. Call the clinic at ${esc(b.clinic_phone)} for help.</div>` : ''}
      <div class="bk-actions">
        ${b.status !== 'cancelled' ? '<button class="btn btn-outline btn-small" id="bk-cal">Add to Google Calendar</button>' : ''}
        ${upcoming ? '<button class="btn btn-danger btn-small" id="bk-cancel">Cancel booking</button>' : ''}
      </div>
    </div>`;
  const calBtn = $('#bk-cal');
  if (calBtn) calBtn.onclick = () => window.open(gcalLink(b), '_blank', 'noopener');
  const cancelBtn = $('#bk-cancel');
  if (cancelBtn) cancelBtn.onclick = () => {
    if (!cancelBtn.dataset.armed) {
      cancelBtn.dataset.armed = '1';
      cancelBtn.textContent = 'Tap again to confirm cancel';
      setTimeout(() => { if (cancelBtn.isConnected) { cancelBtn.dataset.armed = ''; cancelBtn.textContent = 'Cancel booking'; } }, 3000);
      return;
    }
    cancelBooking(b.ref, cancelBtn);
  };
}

async function cancelBooking(ref, btn) {
  btn.disabled = true;
  try {
    await api('/api/bookings/' + encodeURIComponent(ref), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: bkPhone })
    });
    toast('Booking ' + ref + ' cancelled', 'info');
    lookupBooking();
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.dataset.armed = '';
    btn.textContent = 'Cancel booking';
  }
}

/* ---------- WIRE UP ---------- */
$('#search-input').addEventListener('input', e => { state.filter.q = e.target.value; renderBrowse(); });
watchReveals(document);
$('#home-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  state.filter.q = e.target.value;
  $('#search-input').value = e.target.value;
  renderBrowse();
  show('clinics');
});
{ const hbc = $('#home-browse-cta'); if (hbc) hbc.onclick = e => { e.preventDefault(); show('clinics'); }; }
{ const sb = $('#svc-book'); if (sb) sb.onclick = () => show('clinics'); }
$('#cta-find').onclick = () => show('clinics');
$('#cta-track').onclick = () => show('track');
$$('#avail-chips .fchip').forEach(b => b.onclick = () => { state.filter.avail = b.dataset.avail; syncFchips('#avail-chips', 'avail', b.dataset.avail); renderActiveFilters(); renderBrowse(); });
$$('#price-chips .fchip').forEach(b => b.onclick = () => { state.filter.price = b.dataset.price; syncFchips('#price-chips', 'price', b.dataset.price); renderActiveFilters(); renderBrowse(); });
{ const ss = $('#sort-select'); if (ss) ss.onchange = () => {
  state.filter.sort = ss.value;
  if (ss.value === 'nearest' && !state.geo) {
    if (!navigator.geolocation) { toast('Location not available on this device', 'info'); ss.value = 'earliest'; state.filter.sort = 'earliest'; }
    else navigator.geolocation.getCurrentPosition(
      p => { state.geo = [p.coords.latitude, p.coords.longitude]; renderActiveFilters(); renderBrowse(); },
      () => { toast('Location needed for Nearest - showing earliest slots', 'info'); ss.value = 'earliest'; state.filter.sort = 'earliest'; renderActiveFilters(); renderBrowse(); }
    );
  }
  renderActiveFilters(); renderBrowse();
}; }
{ const fo = $('#filters-open'); if (fo) fo.onclick = () => $('#filters-bar').classList.add('open'); }
{ const fd = $('#filters-done'); if (fd) fd.onclick = () => $('#filters-bar').classList.remove('open'); }
const vac = $('#view-all-clinics'); if (vac) vac.onclick = e => { e.preventDefault(); show('clinics'); };
$('#home-area').onchange = e => {
  state.filter.area = e.target.value;
  const sel = $('#area-filter');
  if (sel) sel.value = e.target.value;
  renderBrowse();
  show('clinics');
};

/* sliding pill for segment toggles (measured, transform-free layout but cheap) */
function segSlide(seg) {
  const act = seg && seg.querySelector('.seg-btn.active');
  if (!act) return;
  seg.style.setProperty('--pl', act.offsetLeft + 'px');
  seg.style.setProperty('--pw', act.offsetWidth + 'px');
}
function segSlideAll() { document.querySelectorAll('.seg').forEach(segSlide); }
window.addEventListener('resize', segSlideAll);
document.querySelectorAll('#browse-seg .seg-btn').forEach(b => b.onclick = () => {
  state.browse = b.dataset.seg;
  document.querySelectorAll('#browse-seg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  segSlide($('#browse-seg'));
  $('#clinics-pane').classList.toggle('hidden', state.browse !== 'clinics');
  $('#doctors-pane').classList.toggle('hidden', state.browse !== 'doctors');
  renderBrowse();
});
document.querySelectorAll('#clinic-view-toggle .seg-btn').forEach(b => b.onclick = () => { setMapMode(b.dataset.vt); segSlide($('#clinic-view-toggle')); });
$('#logo-home').onclick = () => show('home');
$('#back-home').onclick = () => show('home');
$('#confirm-home').onclick = () => show('home');
$('#back-home-3').onclick = () => show('home');
$('#back-home-4').onclick = () => show('home');
$('#back-home-5').onclick = () => show('home');
const footClinics = $('#foot-clinics'); if (footClinics) footClinics.onclick = e => { e.preventDefault(); show('clinics'); };
const footTrack = $('#foot-track'); if (footTrack) footTrack.onclick = e => { e.preventDefault(); show('track'); };
const footSignin = $('#foot-signin'); if (footSignin) footSignin.onclick = e => { e.preventDefault(); showSignin(); };
$('#bk-btn').onclick = lookupBooking;
$('#bk-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
$('#bk-phone').addEventListener('keydown', e => { if (e.key === 'Enter') lookupBooking(); });
$('#bk-ref').addEventListener('keydown', e => { if (e.key === 'Enter') lookupBooking(); });
$('#confirm-copy').onclick = async () => {
  const b = state.lastBooking;
  if (!b) return;
  try { await navigator.clipboard.writeText(b.ref); toast('Reference copied', 'info'); }
  catch { toast('Reference: ' + b.ref, 'info'); }
};
$('#confirm-share').onclick = async () => {
  const b = state.lastBooking;
  if (!b) return;
  const text = `Drayvenn Health appointment\n${b.doctor_name} - ${b.clinic_name}\n${fmtDate(b.date)}, ${fmtTime(b.slot)}\nBooking ref: ${b.ref}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
};
$('#confirm-manage').onclick = () => {
  const b = state.lastBooking;
  show('track');
  if (b) {
    $('#bk-ref').value = b.ref;
    $('#bk-phone').value = b.phone;
    lookupBooking();
  }
};

document.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.btn, .chat-action');
  if (!btn || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 1.1;
  const rip = document.createElement('span');
  rip.className = 'ripple';
  rip.style.width = rip.style.height = size + 'px';
  rip.style.left = (e.clientX - r.left - size / 2) + 'px';
  rip.style.top = (e.clientY - r.top - size / 2) + 'px';
  btn.appendChild(rip);
  setTimeout(() => rip.remove(), 650);
});

document.querySelectorAll('.tabbar .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const t = tab.dataset.tab;
    if (window.closeChat) window.closeChat();
    if (t === 'search') {
      show('clinics');
      requestAnimationFrame(() => { const si = $('#search-input'); if (si) { si.scrollIntoView({ block: 'start', behavior: 'instant' }); si.focus({ preventScroll: true }); } });
    } else if (t === 'profile') {
      show('account');
    } else {
      show(t);
    }
  });
});


/* ---------- header account menu ---------- */
function renderAcctMenu() {
  const menu = $('#acct-menu'), btn = $('#acct-menu-btn');
  if (!menu || !btn) return;
  const p = state.patient;
  if (p) {
    const initial = esc(((p.name || p.email || 'A').trim()[0] || 'A').toUpperCase());
    btn.innerHTML = initial;
    btn.classList.add('signed-in');
    menu.innerHTML = `
      <div class="acct-head">
        <div class="acct-name">${esc(p.name || 'My account')}</div>
        <div class="acct-sub">${esc(p.email || (p.phone ? maskPhone(p.phone) : 'Signed in'))}</div>
      </div>
      <button class="acct-item" id="am-bookings" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>
        My bookings</button>
      <button class="acct-item" id="am-account" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
        Account</button>
      <button class="acct-item acct-danger" id="am-logout" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
        Sign out</button>`;
    $('#am-bookings').onclick = () => { closeAcctMenu(); show('mybookings'); };
    $('#am-account').onclick = () => { closeAcctMenu(); show('account'); };
    $('#am-logout').onclick = async () => { closeAcctMenu(); await logout(); };
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>';
    btn.classList.remove('signed-in');
    menu.innerHTML = `
      <div class="acct-head">
        <div class="acct-name">Not signed in</div>
        <div class="acct-sub">Sign in for saved details &amp; booking history</div>
      </div>
      <button class="acct-item" id="am-login" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>
        Sign in</button>
      <button class="acct-item" id="am-track" role="menuitem">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>
        Track a booking</button>`;
    $('#am-login').onclick = () => { closeAcctMenu(); showSignin(); };
    $('#am-track').onclick = () => { closeAcctMenu(); show('track'); };
  }
}
function closeAcctMenu() {
  const menu = $('#acct-menu'), btn = $('#acct-menu-btn');
  if (!menu) return;
  menu.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function initAcctMenu() {
  const btn = $('#acct-menu-btn');
  if (!btn) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    closeAcctMenu();
    show('account');
  });
  document.addEventListener('click', e => {
    const menu = $('#acct-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) closeAcctMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAcctMenu(); });
}

/* ---------- PATIENT ACCOUNT (Step 3) ---------- */
async function loadPatient() {
  try { const { patient } = await api('/api/auth/me'); state.patient = patient; }
  catch { state.patient = null; }
}

const CAL_ICON = `<picture><source media="(prefers-reduced-motion: reduce)" srcset="/brand/anim/cal.png"><img src="/brand/anim/cal.webp" alt="" class="anim-recolor anim-empty"></picture>`;
const ECG_ANIM = `<picture><source media="(prefers-reduced-motion: reduce)" srcset="/brand/anim/ecg.png"><img src="/brand/anim/ecg.webp" alt="" class="anim-recolor"></picture>`;
const SKEL = {
  slots: `<div class="skel skel-slots">${'<i></i>'.repeat(9)}</div>`,
  cards: `<div class="skel skel-cards">${'<i></i>'.repeat(2)}</div>`,
  rows: `<div class="skel skel-rows">${'<i></i>'.repeat(3)}</div>`,
};
const LOADER = (label, kind) => `<div class="anim-load">${ECG_ANIM}<div class="anim-load-label">${label}</div>${SKEL[kind] || ''}</div>`;

function maskPhone(p) { return p ? '+91 ' + p.slice(0, 5) + ' ' + p.slice(5) : ''; }

function showSignin() {
  show('signin');
  renderLogin($('#signin-panel'));
}

function renderAccount() {
  const host = $('#account-panel');
  if (!host) return;
  if (!state.patient) {
    host.innerHTML = `
      <div class="empty-state" style="margin-top:0">
        ${CAL_ICON}
        <div class="empty-title">Your bookings live here</div>
        <div class="empty-sub">Sign in with your mobile number to see every booking in one place, with cancel and reschedule.</div>
        <button class="btn btn-block" id="acct-goto-signin">Sign in</button>
      </div>`;
    $('#acct-goto-signin').onclick = showSignin;
    return;
  }
  const p = state.patient;
  const initial = esc(((p.name || p.email || 'A').trim()[0] || 'A').toUpperCase());
  host.innerHTML = `
  <div class="dash">
    <aside class="dash-side">
      <div class="dash-user">
        <div class="acctp-avatar">${initial}</div>
        <div class="dash-user-info">
          <div class="dash-name">${esc(p.name || 'Set your name')}</div>
          <div class="dash-contact">${esc(p.phone ? maskPhone(p.phone) : (p.email || ''))}</div>
        </div>
      </div>
      <nav class="dash-nav" id="dash-nav">
        <button type="button" class="dash-nav-btn active" data-tab="bookings">My Bookings</button>
        <button type="button" class="dash-nav-btn" data-tab="saved">Saved Clinics</button>
        <button type="button" class="dash-nav-btn" data-tab="family">Family Members</button>
        <button type="button" class="dash-nav-btn" data-tab="profile">Profile Settings</button>
        <button type="button" class="dash-nav-btn dash-logout" id="dash-logout">Logout</button>
      </nav>
    </aside>
    <div class="dash-body">
      <div class="dash-panel" id="dash-panel-bookings">
        <div class="mb-tabs" id="mb-tabs">
          <button type="button" class="mb-tab active" data-mbtab="upcoming">Upcoming</button>
          <button type="button" class="mb-tab" data-mbtab="past">Past</button>
          <button type="button" class="mb-tab" data-mbtab="cancelled">Cancelled</button>
        </div>
        <div id="my-bookings">${LOADER('Loading your bookings&hellip;', 'cards')}</div>
      </div>
      <div class="dash-panel hidden" id="dash-panel-saved">
        <h3 class="dash-h">Saved Clinics</h3>
        <p class="dash-sub">Clinics you save show up here for quick booking.</p>
        <div id="saved-list"></div>
      </div>
      <div class="dash-panel hidden" id="dash-panel-family">
        <h3 class="dash-h">Family Members</h3>
        <p class="dash-sub">Add your family once - book appointments for them from your account.</p>
        <div id="family-list">${LOADER('Loading&hellip;', 'rows')}</div>
        <form class="fam-form" id="family-form">
          <input id="fam-name" placeholder="Full name" maxlength="60" autocomplete="off">
          <input id="fam-age" placeholder="Age" inputmode="numeric" maxlength="3">
          <select id="fam-gender"><option value="">Gender</option><option>Female</option><option>Male</option><option>Other</option></select>
          <select id="fam-relation"><option value="">Relation</option><option>Spouse</option><option>Child</option><option>Parent</option><option>Sibling</option><option>Other</option></select>
          <button class="btn btn-small" type="submit">Add member</button>
        </form>
        <div class="form-error" id="fam-error"></div>
      </div>
      <div class="dash-panel hidden" id="dash-panel-profile">
        <h3 class="dash-h">Profile Settings</h3>
        <p class="dash-sub">Your name and age prefill new bookings.</p>
        <div class="prof-grid">
          <div class="form-row"><label for="prof-name">Full Name</label><input id="prof-name" maxlength="60" value="${(p.name || '').replace(/"/g, '&quot;')}"></div>
          <div class="form-row"><label for="prof-age">Age</label><input id="prof-age" inputmode="numeric" maxlength="3" value="${p.age != null ? p.age : ''}"></div>
          <div class="form-row"><label>Mobile Number</label><input value="${esc(p.phone ? maskPhone(p.phone) : '-')}" disabled></div>
          <div class="form-row"><label>Email</label><input value="${esc(p.email || '-')}" disabled></div>
        </div>
        <p class="dash-note">Mobile and email are your sign-in - they can't be changed here.</p>
        <button type="button" class="btn btn-small" id="prof-save">Save changes</button>
        <div class="form-error" id="prof-error"></div>
      </div>
    </div>
  </div>`;
  $('#dash-nav').querySelectorAll('.dash-nav-btn[data-tab]').forEach(btn => btn.onclick = () => showDash(btn.dataset.tab));
  $('#dash-logout').onclick = async () => { await logout(); };
  $('#mb-tabs').querySelectorAll('.mb-tab').forEach(btn => btn.onclick = () => {
    state.mbTab = btn.dataset.mbtab;
    $('#mb-tabs').querySelectorAll('.mb-tab').forEach(t => t.classList.toggle('active', t === btn));
    renderMbList();
  });
  wireFamilyForm();
  $('#prof-save').onclick = saveProfile;
  loadMyBookings();
}

function showDash(tab) {
  state.dashTab = tab;
  document.querySelectorAll('#dash-nav .dash-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.dash-panel').forEach(pn => pn.classList.add('hidden'));
  const panel = $('#dash-panel-' + tab);
  if (panel) panel.classList.remove('hidden');
  if (tab === 'bookings') renderMbList();
  if (tab === 'saved') renderSaved();
  if (tab === 'family') loadFamily();
}

/* Saved clinics (localStorage). */
function getSavedClinics() { try { return JSON.parse(localStorage.getItem('dh_saved_clinics') || '[]'); } catch { return []; } }
function isClinicSaved(id) { return getSavedClinics().some(c => c.id === id); }
function toggleSaveClinic(c) {
  const list = getSavedClinics();
  const i = list.findIndex(x => x.id === c.id);
  if (i >= 0) { list.splice(i, 1); toast('Removed from saved clinics', 'info'); }
  else { list.push({ id: c.id, name: c.name, area: c.area, min_fee: c.min_fee }); toast('Saved - find it under My Account', 'info'); }
  localStorage.setItem('dh_saved_clinics', JSON.stringify(list));
}
function updateSaveBtn() {
  const btn = $('#dt-save');
  if (!btn || !state.clinic) return;
  const saved = isClinicSaved(state.clinic.id);
  btn.innerHTML = saved ? '&#9829; Saved' : '&#9825; Save';
  btn.classList.toggle('btn-save-on', saved);
}
function renderSaved() {
  const host = $('#saved-list'); if (!host) return;
  const list = getSavedClinics();
  if (!list.length) {
    host.innerHTML = `<div class="empty-state">
      ${CAL_ICON}
      <div class="empty-title">No saved clinics yet</div>
      <div class="empty-sub">Tap Save on any clinic page and it shows up here.</div>
      <button type="button" class="btn btn-outline btn-small" id="sv-browse">Browse clinics</button>
    </div>`;
    const bb = $('#sv-browse'); if (bb) bb.onclick = () => show('home');
    return;
  }
  host.innerHTML = list.map(c => `
    <div class="saved-row">
      <div>
        <div class="bk-clinic">${esc(c.name)}</div>
        <div class="bk-doc">${[c.area, c.min_fee ? 'from \u20B9' + c.min_fee : ''].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
      </div>
      <div class="bk-actions">
        <button type="button" class="btn btn-small" data-open="${esc(String(c.id))}">View &amp; Book</button>
        <button type="button" class="btn btn-small btn-ghost" data-unsave="${esc(String(c.id))}">Remove</button>
      </div>
    </div>`).join('');
  host.querySelectorAll('[data-open]').forEach(btn => btn.onclick = () => openClinic(btn.dataset.open));
  host.querySelectorAll('[data-unsave]').forEach(btn => btn.onclick = () => {
    toggleSaveClinic({ id: btn.dataset.unsave });
    renderSaved();
  });
}

/* Family members. */
async function loadFamily() {
  const host = $('#family-list'); if (!host) return;
  if (!state.patient) { host.innerHTML = ''; return; }
  try {
    const { members } = await api('/api/my/family');
    state.familyMembers = members;
    renderFamilyList(members);
  } catch (e) { host.innerHTML = '<div class="loading">Could not load family members.</div>'; }
}
function renderFamilyList(members) {
  const host = $('#family-list'); if (!host) return;
  if (!members.length) { host.innerHTML = '<p class="dash-note">No family members added yet.</p>'; return; }
  host.innerHTML = members.map(m => `
    <div class="fam-row">
      <div>
        <div class="bk-clinic">${esc(m.name)}</div>
        <div class="bk-doc">${[m.relation, m.age != null ? m.age + ' yrs' : '', m.gender].filter(Boolean).map(x => esc(String(x))).join(' · ')}</div>
      </div>
      <div class="bk-actions">
        <button type="button" class="btn btn-small btn-outline" data-bookfor="${m.id}">Book appointment</button>
        <button type="button" class="btn btn-small btn-ghost" data-famdel="${m.id}">Remove</button>
      </div>
    </div>`).join('');
  host.querySelectorAll('[data-bookfor]').forEach(btn => btn.onclick = () => {
    const m = (state.familyMembers || []).find(x => String(x.id) === btn.dataset.bookfor);
    if (!m) return;
    state.bookingFor = { name: m.name, age: m.age, gender: m.gender, relation: m.relation };
    show('home');
    toast('Booking for ' + m.name + ' - pick a clinic', 'info');
  });
  host.querySelectorAll('[data-famdel]').forEach(btn => btn.onclick = async () => {
    if (!confirm('Remove this family member?')) return;
    try {
      await api('/api/my/family', { method: 'POST', body: { action: 'remove', id: btn.dataset.famdel } });
      toast('Removed', 'info');
      loadFamily();
    } catch (e) { toast(e.message, 'error'); }
  });
}
function wireFamilyForm() {
  const form = $('#family-form'); if (!form) return;
  $('#fam-age').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });
  form.onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#fam-error'); err.style.display = 'none';
    const name = $('#fam-name').value.trim();
    if (name.length < 2) { err.textContent = 'Enter the family member name.'; err.style.display = 'block'; return; }
    try {
      await api('/api/my/family', { method: 'POST', body: { action: 'add', name, age: $('#fam-age').value, gender: $('#fam-gender').value, relation: $('#fam-relation').value } });
      form.reset();
      toast(name + ' added', 'info');
      loadFamily();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
  };
}

/* Profile settings. */
async function saveProfile() {
  const err = $('#prof-error'); err.style.display = 'none';
  try {
    await api('/api/auth/profile', { method: 'POST', body: { name: $('#prof-name').value.trim(), age: $('#prof-age').value.trim() } });
    const { patient } = await api('/api/auth/me');
    state.patient = patient;
    toast('Details saved', 'info');
    renderAccount();
    renderAcctMenu();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

function renderLogin(host) {

  host.innerHTML = `
    <div class="signin-head">
      <h2 class="signin-title">Sign in or create account</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:4px 0 16px">One code on your mobile - no passwords. New number? Your account is created automatically.</p>
    </div>
    <a class="btn btn-block btn-glass google-start" href="/api/auth/google/start" style="display:block;text-align:center">Continue with Google</a>
    <button type="button" class="btn btn-block btn-apple" id="login-apple" style="margin-top:10px">Continue with Apple</button>
    <div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--muted);font-size:12px"><span style="flex:1;height:1px;background:var(--line,rgba(190,220,215,.4))"></span>or use your mobile number<span style="flex:1;height:1px;background:var(--line,rgba(190,220,215,.4))"></span></div>
    <div class="form-grid" id="login-phone-step">
      <div class="form-row"><label for="login-phone">Mobile number</label>
        <div class="phone-wrap"><span class="phone-prefix">+91</span><input id="login-phone" type="tel" placeholder="98765 43210" inputmode="numeric" maxlength="10" autocomplete="tel-national"></div>
      </div>
      <div class="form-error" id="login-error"></div>
      <button class="btn btn-block" id="login-send">Get OTP</button>
    </div>
    <div class="form-grid hidden signin-otp" id="login-otp-step">
      <div class="form-row"><label for="login-otp">Code sent to <b id="login-sent-to"></b></label><input id="login-otp" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="letter-spacing:6px;text-align:center;font-size:18px"></div>
      <div class="dev-code hidden" id="login-devcode"></div>
      <div class="form-error" id="otp-error"></div>
      <button class="btn btn-block" id="login-verify">Verify &amp; sign in</button>
      <button class="btn btn-block btn-ghost" id="login-back">Change number</button>
    </div>
    <div class="privacy-line" style="margin-top:14px">Codes expire in 10 minutes. Signing in creates your account on first use.</div>`;
  $('#login-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  $('#login-otp').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('#login-send').onclick = requestOtp;
  $('#login-verify').onclick = verifyOtp;
  $('#login-back').onclick = () => { $('#login-otp-step').classList.add('hidden'); $('#login-phone-step').classList.remove('hidden'); };
  bindGoogleStart(host);
  $('#login-apple').onclick = () => {
    /* Apple sign-in is staged, not faked: it needs a paid Apple Developer
       account (Services ID + key), which is not in the zero-budget plan yet.
       Honest message, no dead endpoint. */
    toast('Apple sign-in is being set up - use Google or your mobile number for now', 'info');
  };
}

/* Follows /api/auth/google/start in JS so the clean "switching on" message
   shows as a toast instead of a raw JSON page when Google is not configured. */
function bindGoogleStart(root) {
  (root || document).querySelectorAll('.google-start').forEach(a => {
    a.onclick = async e => {
      e.preventDefault();
      try {
        const res = await fetch(a.href, { redirect: 'manual' });
        if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) { location.href = a.href; return; }
        const data = await res.json().catch(() => ({}));
        toast(data.message || data.error || 'Google sign-in is unavailable right now', 'info');
      } catch { location.href = a.href; }
    };
  });
}

async function requestOtp() {
  const err = $('#login-error');
  err.style.display = 'none';
  const phone = $('#login-phone').value.trim();
  if (!/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Enter a valid 10-digit mobile number.'; err.style.display = 'block'; return; }
  const btn = $('#login-send');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const data = await api('/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
    $('#login-sent-to').textContent = '+91 ' + phone.slice(0, 5) + ' ' + phone.slice(5);
    const dev = $('#login-devcode');
    if (data && data.dev && data.devCode) {
      dev.innerHTML = '<b>Preview demo</b> - real SMS starts when MSG91 is connected. Demo code: <b>' + esc(data.devCode) + '</b>';
      dev.classList.remove('hidden');
      $('#login-otp').value = data.devCode;
    } else {
      dev.classList.add('hidden');
      $('#login-otp').value = '';
    }
    $('#login-phone-step').classList.add('hidden');
    $('#login-otp-step').classList.remove('hidden');
    $('#login-otp').focus({ preventScroll: true });
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Get OTP';
}

async function verifyOtp() {
  const err = $('#otp-error');
  err.style.display = 'none';
  const phone = $('#login-phone').value.trim();
  const code = $('#login-otp').value.trim();
  if (!/^\d{6}$/.test(code)) { err.textContent = 'Enter the 6-digit code.'; err.style.display = 'block'; return; }
  const btn = $('#login-verify');
  btn.disabled = true; btn.textContent = 'Verifying...';
  try {
    const { patient } = await api('/api/auth/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }) });
    state.patient = patient;
    renderAcctMenu();
    toast('Signed in', 'info');
    show('mybookings');
    renderAccount();
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Verify & sign in';
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  state.patient = null;
  state.myBookings = [];
  state.familyMembers = [];
  state.bookingFor = null;
  toast('Signed out', 'info');
  renderAccount();
  renderAcctMenu();
}

const MB_STATUS = { pending: 'Pending confirmation', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed' };

async function loadMyBookings() {
  const host = $('#my-bookings');
  if (!host) return;
  try {
    const { bookings } = await api('/api/my/bookings');
    state.myBookings = bookings;
    renderMbList();
  } catch (e) {
    host.innerHTML = '<div class="loading">Could not load bookings. <a href="#" id="my-retry">Retry</a></div>';
    const r = $('#my-retry'); if (r) r.onclick = ev => { ev.preventDefault(); loadMyBookings(); };
  }
}

function renderMbList() {
  const host = $('#my-bookings'); if (!host) return;
  const all = state.myBookings || [];
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const tab = state.mbTab || 'upcoming';
  let rows = all.filter(b => {
    if (tab === 'cancelled') return b.status === 'cancelled';
    if (tab === 'past') return b.status !== 'cancelled' && b.date < today;
    return b.status !== 'cancelled' && b.date >= today;
  });
  rows = rows.slice().sort((a, c) => tab === 'upcoming'
    ? (a.date + a.slot).localeCompare(c.date + c.slot)
    : (c.date + c.slot).localeCompare(a.date + a.slot));
  if (!rows.length) {
    const msg = tab === 'upcoming' ? ['No upcoming appointments', 'Book a visit and it shows up here.']
      : tab === 'past' ? ['No past appointments', 'Your completed and older visits will show here.']
      : ['No cancelled bookings', 'Bookings you cancel will show here.'];
    host.innerHTML = `<div class="empty-state">
      ${CAL_ICON}
      <div class="empty-title">${msg[0]}</div>
      <div class="empty-sub">${msg[1]}</div>
      ${tab === 'upcoming' ? '<button type="button" class="btn btn-outline btn-small" id="mb-browse">Browse clinics</button>' : ''}
    </div>`;
    const bb = $('#mb-browse'); if (bb) bb.onclick = () => show('home');
    return;
  }
  host.innerHTML = rows.map(b => {
    const upcoming = b.status !== 'cancelled' && b.date >= today;
    return `
    <div class="bk-card" data-ref="${esc(b.ref)}">
      <div class="bk-top">
        <span class="bk-ref">${esc(b.ref)}</span>
        <span class="bk-badge bdg-${esc(b.status)}">${esc(MB_STATUS[b.status] || b.status)}</span>
      </div>
      <div class="bk-clinic">${esc(b.clinic_name)}</div>
      <div class="bk-doc">${esc(b.doctor_name)}${b.specialty ? ' · ' + esc(b.specialty) : ''}</div>
      <div class="bk-meta">${fmtDate(b.date)} · ${fmtTime(b.slot)}${b.fee ? ' · \u20B9' + b.fee : ''}</div>
      ${b.clinic_address ? `<div class="bk-addr">${esc(b.clinic_address)}</div>` : ''}
      <div class="bk-actions">
        <button type="button" class="btn btn-small btn-outline" data-act="details">View Details</button>
        ${upcoming
          ? `<button type="button" class="btn btn-small btn-outline" data-act="reschedule" data-doctor="${esc(b.doctor_id)}">Reschedule</button>
             <button type="button" class="btn btn-small btn-ghost bk-danger" data-act="cancel">Cancel</button>`
          : `<button type="button" class="btn btn-small btn-outline" data-act="again">Book Again</button>`}
      </div>
      <div class="rs-panel hidden"></div>
    </div>`;
  }).join('');
  host.querySelectorAll('.bk-card [data-act]').forEach(btn => btn.onclick = () => {
    const card = btn.closest('.bk-card');
    const b = (state.myBookings || []).find(x => x.ref === card.dataset.ref);
    if (!b) return;
    if (btn.dataset.act === 'details') openBookingModal(b);
    else if (btn.dataset.act === 'cancel') myCancel(card, b.ref);
    else if (btn.dataset.act === 'reschedule') myReschedulePanel(card, b.ref, btn.dataset.doctor);
    else if (btn.dataset.act === 'again') openClinic(b.clinic_id);
  });
}

function closeBModal() { const m = $('#bmodal-overlay'); if (m) m.remove(); }
function openBookingModal(b) {
  closeBModal();
  const co = CLINIC_COORDS[b.clinic_id];
  const dirUrl = co
    ? `https://www.google.com/maps/dir/?api=1&destination=${co[0]},${co[1]}`
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((b.clinic_name || '') + ' ' + (b.clinic_address || ''));
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const upcoming = b.status !== 'cancelled' && b.date >= today;
  const ov = document.createElement('div');
  ov.id = 'bmodal-overlay';
  ov.className = 'bmodal-overlay';
  ov.innerHTML = `
    <div class="bmodal" role="dialog" aria-modal="true" aria-label="Booking details">
      <div class="bmodal-head">
        <div>
          <span class="bk-badge bdg-${esc(b.status)}">${esc(MB_STATUS[b.status] || b.status)}</span>
          <h3 class="bmodal-title">${esc(b.clinic_name)}</h3>
        </div>
        <button type="button" class="bmodal-x" id="bmodal-close" aria-label="Close">&times;</button>
      </div>
      <div class="bmodal-body">
        <div class="brow"><span>Booking ID</span><b>${esc(b.ref)}</b></div>
        <div class="brow"><span>Doctor</span><b>${esc(b.doctor_name)}${b.specialty ? ' · ' + esc(b.specialty) : ''}</b></div>
        <div class="brow"><span>Patient</span><b>${esc(b.patient_name)}${b.age != null && b.age !== '' ? ', ' + esc(String(b.age)) : ''}${b.gender ? ' · ' + esc(b.gender) : ''}</b></div>
        <div class="brow"><span>Date &amp; time</span><b>${fmtDate(b.date)} · ${fmtTime(b.slot)}</b></div>
        ${b.concern ? `<div class="brow"><span>Symptoms</span><b>${esc(b.concern)}</b></div>` : ''}
        ${b.clinic_address ? `<div class="brow"><span>Address</span><b>${esc(b.clinic_address)}</b></div>` : ''}
        ${b.clinic_phone ? `<div class="brow"><span>Clinic phone</span><b><a href="tel:${esc(b.clinic_phone)}">${esc(b.clinic_phone)}</a></b></div>` : ''}
        <div class="brow"><span>Fee</span><b>${b.fee ? '\u20B9' + b.fee + ' · pay at clinic' : 'Pay at clinic'}</b></div>
      </div>
      <div class="bmodal-actions">
        <a class="btn btn-small btn-outline" target="_blank" rel="noopener" href="${gcalLink({ doctor_name: b.doctor_name, clinic_name: b.clinic_name, ref: b.ref, patient_name: b.patient_name, fee: b.fee, date: b.date, slot: b.slot, clinic_address: b.clinic_address })}">Add to Calendar</a>
        <button type="button" class="btn btn-small btn-whatsapp" id="bm-share">Share on WhatsApp</button>
        <a class="btn btn-small btn-outline" target="_blank" rel="noopener" href="${dirUrl}">Get Directions</a>
        ${upcoming ? `<button type="button" class="btn btn-small btn-outline" id="bm-resched">Reschedule</button>
        <button type="button" class="btn btn-small btn-ghost bk-danger" id="bm-cancel">Cancel booking</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(ov);
  $('#bmodal-close').onclick = closeBModal;
  ov.addEventListener('click', e => { if (e.target === ov) closeBModal(); });
  $('#bm-share').onclick = () => {
    const text = `Drayvenn Health appointment\n${b.doctor_name} - ${b.clinic_name}\n${fmtDate(b.date)}, ${fmtTime(b.slot)}\nBooking ref: ${b.ref}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  const rc = $('#bm-resched'); if (rc) rc.onclick = () => { closeBModal(); const card = document.querySelector(`.bk-card[data-ref="${CSS.escape(b.ref)}"]`); if (card) myReschedulePanel(card, b.ref, b.doctor_id); };
  const cc = $('#bm-cancel'); if (cc) cc.onclick = () => { closeBModal(); const card = document.querySelector(`.bk-card[data-ref="${CSS.escape(b.ref)}"]`); if (card) myCancel(card, b.ref); };
}

async function myCancel(row, ref) {
  if (!confirm('Cancel booking ' + ref + '?')) return;
  try {
    await api('/api/my/bookings/' + encodeURIComponent(ref), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
    toast('Booking ' + ref + ' cancelled', 'info');
    loadMyBookings();
  } catch (e) { toast(e.message, 'error'); }
}

function myReschedulePanel(row, ref, doctorId) {
  const panel = row.querySelector('.rs-panel');
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const max = new Date(Date.now() + 330 * 60000 + 13 * 86400000).toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="rs-title">Reschedule ${esc(ref)}</div>
    <div class="rs-grid">
      <input type="date" class="rs-date" min="${today}" max="${max}" value="${today}">
      <select class="rs-slot"><option value="">Pick date first</option></select>
      <button class="btn rs-save">Move booking</button>
    </div>
    <div class="form-error" style="margin-top:6px"></div>`;
  panel.classList.remove('hidden');
  const dateEl = panel.querySelector('.rs-date');
  const slotEl = panel.querySelector('.rs-slot');
  const errEl = panel.querySelector('.form-error');
  dateEl.onchange = async () => {
    slotEl.innerHTML = '<option value="">Loading...</option>';
    try {
      const { slots } = await api('/api/slots?doctor_id=' + encodeURIComponent(doctorId) + '&date=' + dateEl.value);
      slotEl.innerHTML = slots.map(s => `<option value="${s.time}" ${s.available ? '' : 'disabled'}>${fmtTime(s.time)}${s.available ? '' : ' (taken)'}</option>`).join('');
    } catch (e) { slotEl.innerHTML = '<option value="">No slots</option>'; errEl.textContent = e.message; errEl.style.display = 'block'; }
  };
  panel.querySelector('.rs-save').onclick = async () => {
    errEl.style.display = 'none';
    const slot = slotEl.value;
    if (!dateEl.value || !slot) { errEl.textContent = 'Pick a date and a time.'; errEl.style.display = 'block'; return; }
    try {
      await api('/api/my/bookings/' + encodeURIComponent(ref), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reschedule', date: dateEl.value, slot }) });
      toast('Moved to ' + fmtDate(dateEl.value) + ' ' + fmtTime(slot), 'info');
      loadMyBookings();
    } catch (e) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  };
}

/* Handle Google redirect landings. */
(function () {
  const q = new URLSearchParams(location.search);
  let landing = null;
  if (q.get('login') === 'google') { toast('Signed in with Google', 'info'); landing = 'account'; }
  if (q.get('linked') === 'google') { toast('Google account connected', 'info'); landing = 'account'; }
  if (landing) history.replaceState(null, '', location.pathname + location.hash);
  window.__postLoginLanding = landing;
})();

window.openClinicFromChat = openClinic;
window.showFromChat = show;
loadClinics();
initAcctMenu();
loadPatient().then(() => {
  renderAcctMenu();
  if (window.__postLoginLanding) show(window.__postLoginLanding);
  else if (!$('#view-mybookings').classList.contains('hidden')) renderAccount();
});

/* v92 - FAQ accordion */
document.querySelectorAll('.faq-q').forEach(btn => btn.addEventListener('click', () => {
  const item = btn.closest('.faq-item');
  const wasOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(x => x.classList.remove('open'));
  if (!wasOpen) item.classList.add('open');
}));

/* v94 - header Book CTA scrolls to featured clinics */
const topnavBook = document.getElementById('topnav-book');
if (topnavBook) topnavBook.onclick = () => { const g = document.getElementById('featured-grid'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

/* v95 - page views routing */
const PAGE_VIEWS = { about: 'about', services: 'services', contact: 'contact', faqs: 'faqs' };
function openPage(p) { if (p === 'faqs') { show('home'); setTimeout(() => { const f = document.getElementById('faqs'); if (f) f.scrollIntoView({ behavior: 'smooth' }); }, 120); return; } show(PAGE_VIEWS[p] || '404'); }
window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if (!h) return;
  if (PAGE_VIEWS[h]) openPage(h);
});
const b404 = document.getElementById('btn-404-home');
if (b404) b404.onclick = () => show('home');
document.querySelectorAll('.footer-links a').forEach(a => {
  const href = a.getAttribute('href') || '';
  if (href === '#about-sec') { a.setAttribute('href', '#about'); }
  else if (href === '#services') { a.setAttribute('href', '#services'); }
  else if (href === '#contact') { a.setAttribute('href', '#contact'); }
});

/* v95b - honor hash on initial load */
setTimeout(() => { const h = location.hash.replace('#', ''); if (PAGE_VIEWS[h]) openPage(h); }, 60);
