const state = {
  clinics: [],
  filter: { q: '', spec: 'All', area: 'All' },
  browse: 'clinics', mapMode: 'list',
  clinic: null,
  booking: { doctor: null, date: null, slot: null },
  lastBooking: null,
  patient: null
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function show(view) {
  // safety: a stuck scroll lock must never survive a view switch
  if (!document.getElementById('wizard-overlay')) document.body.classList.remove('wiz-open');
  if (view === 'mybookings') renderAccount();
  for (const v of ['home', 'clinics', 'clinic', 'confirm', 'mybookings', 'signin']) {
    const el = document.getElementById('view-' + v);
    el.classList.toggle('hidden', v !== view);
    if (v === view) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    }
  }
  const tabFor = { home: 'home', clinics: 'clinics', clinic: 'clinics', confirm: 'home', mybookings: 'mybookings' };
  document.querySelectorAll('.tabbar .tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tabFor[view]));
  window.scrollTo({ top: 0 });
}

function toast(msg, kind) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || 'info');
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3600);
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
    // hero "next slot" chip shows the real earliest slot, not a static mock time
    const chip = document.getElementById('fc-next');
    if (chip) {
      const rank = n => n.today ? '0' : n.tomorrow ? '1' : '2' + n.date;
      const next = clinics.map(c => c.next_available).filter(Boolean).sort((x, y) => (rank(x) + x.time).localeCompare(rank(y) + y.time))[0];
      if (next) chip.innerHTML = '🕕 ' + esc(fmtNext(next)) + ' <span class="fc-sub">next slot</span>';
      else chip.style.display = 'none';
    }
    renderSpecChips();
    renderAreaFilter();
    renderHomeExtras();
    renderRecentClinics();
    renderHomeHighlights();
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
  sel.onchange = () => { state.filter.area = sel.value; renderBrowse(); };
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
  host.innerHTML = valid.map(x => `<button class="chip" data-id="${esc(x.id)}">${esc(x.emoji)} ${esc(x.name)}</button>`).join('');
  host.querySelectorAll('.chip').forEach(b => b.onclick = () => openClinic(b.dataset.id));
}

function renderHomeExtras() {
  const specs = new Map();
  state.clinics.forEach(c => c.specialties.forEach(s => specs.set(s, (specs.get(s) || 0) + 1)));
  const host = $('#browse-specs');
  if (host) {
    host.innerHTML = [...specs.entries()].slice(0, 8).map(([s, n]) =>
      `<button class="browse-card" data-spec="${esc(s)}"><div class="browse-name">${esc(s)}</div><div class="browse-sub">${n} clinic${n > 1 ? 's' : ''}</div></button>`).join('');
    host.querySelectorAll('.browse-card').forEach(b => b.onclick = () => {
      state.filter.spec = b.dataset.spec;
      renderSpecChips(); renderBrowse();
      show('clinics');
    });
  }
  const ah = $('#home-areas');
  if (ah) {
    const areas = [...new Set(state.clinics.map(c => c.area))].sort();
    ah.innerHTML = areas.map(a => `<button class="chip" data-area="${esc(a)}">📍 ${esc(a)}</button>`).join('');
    ah.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      state.filter.area = b.dataset.area;
      const sel = $('#area-filter');
      if (sel) sel.value = b.dataset.area;
      renderBrowse();
      show('clinics');
    });
  }
}

function renderSpecChips() {
  const specs = new Set();
  state.clinics.forEach(c => c.specialties.forEach(s => specs.add(s)));
  const host = $('#spec-chips');
  host.innerHTML = '';
  for (const s of ['All', ...specs]) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.filter.spec === s ? ' active' : '');
    b.textContent = s;
    b.onclick = () => { state.filter.spec = s; renderSpecChips(); renderBrowse(); };
    host.appendChild(b);
  }
}

function filteredClinics() {
  const q = state.filter.q.toLowerCase();
  return state.clinics.filter(c => {
    const inSpec = state.filter.spec === 'All' || c.specialties.includes(state.filter.spec);
    if (!inSpec) return false;
    if (state.filter.area !== 'All' && c.area !== state.filter.area) return false;
    if (!q) return true;
    const hay = [c.name, c.area, c.tagline, c.specialties.join(' '), c.doctors.map(d => d.name + ' ' + d.specialty).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderClinics() {
  const list = filteredClinics();
  const host = $('#clinic-list');
  if (!list.length) {
    host.innerHTML = '<div class="loading">No clinics match that search.</div>';
  } else {
    host.innerHTML = list.map((c, i) => clinicCardHTML(c, i)).join('');
    bindClinicCards(host);
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
      if (state.filter.spec !== 'All' && d.specialty !== state.filter.spec && !c.specialties.includes(state.filter.spec)) continue;
      if (q) {
        const hay = [d.name, d.specialty, d.qualification, c.name, c.area].join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      docs.push({ ...d, clinic_id: c.id, clinic_name: c.name, clinic_area: c.area });
    }
  }
  if (!docs.length) {
    host.innerHTML = '<div class="loading">No doctors match that search.</div>';
    return;
  }
  host.innerHTML = docs.map((d, i) => {
    const initials = d.name.replace(/^Dr\.?\s+/i, '').split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
    return `
    <div class="clinic-card doc-browse-card" data-clinic="${esc(d.clinic_id)}" role="button" tabindex="0" style="animation-delay:${i * 40}ms" aria-label="View ${esc(d.name)} at ${esc(d.clinic_name)}">
      <div class="doc-browse-top">
        <div class="doc-avatar">${esc(initials)}</div>
        <div>
          <div class="db-name">${esc(d.name)}</div>
          <div class="db-qual">${esc(d.qualification)}${d.experience_years ? ' · ' + d.experience_years + ' yrs exp' : ''}</div>
        </div>
      </div>
      <div class="spec-chips" style="margin-top:10px"><span class="spec-chip">${esc(d.specialty)}</span></div>
      <div class="doc-browse-clinic">🏥 ${esc(d.clinic_name)} · 📍 ${esc(d.clinic_area)}</div>
      <div class="doc-meta">🗓 ${esc(d.days_label)} · ₹${d.fee}</div>
      ${fmtNext(d.next_available) ? `<div class="next-slot">Next slot: <b>${fmtNext(d.next_available)}</b></div>` : ''}
    </div>`;
  }).join('');
  host.querySelectorAll('.doc-browse-card').forEach(el => {
    const open = () => openClinic(el.dataset.clinic);
    el.onclick = open;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

/* ---------- MAP (OpenStreetMap + Leaflet) ---------- */
let map = null, mapMarkers = [];

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
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
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
    const m = L.marker(co).addTo(map);
    m.bindPopup(`<div class="map-card">
      <div class="mc-name">${c.emoji} ${esc(c.name)}</div>
      <div class="mc-area">📍 ${esc(c.area)}</div>
      <div class="mc-meta">from ₹${c.min_fee}${fmtNext(c.next_available) ? ' · Next: ' + esc(fmtNext(c.next_available)) : ''}</div>
      <button type="button" class="mc-open" data-id="${esc(c.id)}">View clinic</button>
    </div>`);
    mapMarkers.push(m);
  }
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
}

function clinicCardHTML(c, i) {
  return `
    <div class="clinic-card" data-id="${esc(c.id)}" role="button" tabindex="0" style="animation-delay:${i * 40}ms" aria-label="View ${esc(c.name)}">
      <div class="clinic-head">
        <div class="clinic-emoji">${c.emoji}</div>
        <div>
          <div class="clinic-name">${esc(c.name)}</div>
          <div class="clinic-area">📍 ${esc(c.area)}</div>
        </div>
      </div>
      <div class="clinic-tagline">${esc(c.tagline || '')}</div>
      <div class="spec-chips">${c.specialties.map(s => `<span class="spec-chip">${esc(s)}</span>`).join('')}</div>
      <div class="clinic-foot">
        <span class="sample-badge">Sample clinic</span>
        <span class="fee">from ₹${c.min_fee}</span>
      </div>
      ${fmtNext(c.next_available) ? `<div class="next-slot">Next slot: <b>${fmtNext(c.next_available)}</b></div>` : ''}
    </div>`;
}

function bindClinicCards(host) {
  host.querySelectorAll('.clinic-card').forEach(el => {
    el.onclick = () => openClinic(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClinic(el.dataset.id); } };
  });
}

function renderHomeHighlights() {
  const host = $('#home-highlights');
  if (!host || !state.clinics.length) return;
  host.innerHTML = state.clinics.slice(0, 3).map((c, i) => clinicCardHTML(c, i)).join('');
  bindClinicCards(host);
}

/* ---------- CLINIC DETAIL ---------- */
async function openClinic(id) {
  show('clinic');
  $('#clinic-detail').innerHTML = '<div class="loading">Loading...</div>';
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

function renderClinicDetail() {
  const c = state.clinic;
  $('#clinic-detail').innerHTML = `
    <div class="detail-head">
      <div class="clinic-emoji">${c.emoji}</div>
      <div>
        <h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em">${esc(c.name)}</h1>
        <div style="color:var(--muted);font-size:14px;margin-top:2px">📍 ${esc(c.area)} · <span class="sample-badge">Sample clinic</span></div>
      </div>
    </div>
    <div class="info-card">
      <div><b>Address:</b> ${esc(c.address)}</div>
      <div><b>Timings:</b> ${esc(c.timings)}</div>
      <div><b>Phone:</b> ${esc(c.phone)}</div>
      <div class="spec-chips" style="margin-top:4px">${c.specialties.map(s => `<span class="spec-chip">${esc(s)}</span>`).join('')}</div>
    </div>
    ${(() => {
      const co = CLINIC_COORDS[c.id];
      if (!co) return '';
      const [lat, lon] = co, d = 0.008;
      const bbox = [lon - d, lat - d * 0.8, lon + d, lat + d * 0.8].join('%2C');
      return `<div class="map-card">
        <iframe title="Map to ${esc(c.name)}" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}"></iframe>
        <div class="map-foot"><b>📍 ${esc(c.area)}</b><span>
          <a href="https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}" target="_blank" rel="noopener">Directions →</a>
          &nbsp;·&nbsp; <a href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">Call clinic</a>
        </span></div>
      </div>`;
    })()}`;
  $('#doctor-list').innerHTML = '<h2 class="section-title" style="margin-top:24px">Doctors</h2>' + c.doctors.map(d => `
    <div class="doctor-card">
      <div class="doc-avatar">${esc(d.name.replace('Dr. ', '').charAt(0))}</div>
      <div class="doc-info">
        <div class="doc-name">${esc(d.name)}</div>
        <div class="doc-spec">${esc(d.specialty)}</div>
        <div class="doc-meta">${esc(d.qualification)} · ${d.experience_years} yrs experience</div>
        <div class="doc-meta">🗓 ${esc(d.days_label)}${d.next_available ? ` · <span class="doc-next">Next: ${fmtNext(d.next_available)}</span>` : ' · <span style="color:var(--amber)">No slots in 14 days</span>'}</div>
      </div>
      <div class="doc-right">
        <div class="doc-fee">₹${d.fee} <small>consult</small></div>
        <button class="btn btn-small" data-doc="${esc(d.id)}">Book appointment</button>
        <button class="doc-more" data-docinfo="${esc(d.id)}">Details</button>
      </div>
    </div>`).join('');
  $('#doctor-list').querySelectorAll('button[data-doc]').forEach(b => {
    b.onclick = () => openBooking(b.dataset.doc);
  });
  $('#doctor-list').querySelectorAll('button[data-docinfo]').forEach(b => {
    b.onclick = () => openDoctorModal(b.dataset.docinfo);
  });
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
        <div class="doc-avatar">${esc(d.name.replace(/^Dr\.?\s*/i, '').trim().charAt(0))}</div>
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
const WIZ_STEPS = ['date', 'time', 'details', 'review'];
const WIZ_LABELS = { date: 'Date', time: 'Time', details: 'Details', review: 'Confirm' };

function openBooking(doctorId) {
  const doctor = state.clinic.doctors.find(d => d.id === doctorId);
  state.booking = { doctor, date: null, slot: null, step: 'date' };
  if (state.patient) {
    if (state.patient.name) state.booking.pname = state.patient.name;
    if (state.patient.phone) state.booking.pphone = state.patient.phone;
    if (state.patient.age != null) state.booking.page = state.patient.age;
  }
  closeWizard();
  const ov = document.createElement('div');
  ov.id = 'wizard-overlay';
  ov.innerHTML = `
    <div class="wizard" role="dialog" aria-modal="true" aria-label="Book appointment">
      <div class="wiz-head">
        <div class="doc-avatar wiz-avatar">${esc((doctor.name.replace(/^Dr\.?\s*/i, '').trim()[0] || 'D').toUpperCase())}</div>
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
    chip('📅', date ? fmtDateShort(date) : '', !!date) +
    chip('🕐', slot ? fmtTime(slot) : '', !!slot) +
    chip('💳', '₹' + doctor.fee + ' at clinic', true);
}

function renderWizard(dir) {
  wizRenderProgress();
  wizRenderLive();
  const { step } = state.booking;
  const host = $('#wiz-steps');
  const anim = dir === 'back' ? 'stepInL' : dir === 'none' ? 'stepFade' : 'stepInR';
  if (step === 'date') host.innerHTML = wizDateHTML();
  else if (step === 'time') host.innerHTML = '<div class="slot-grid">' + '<div class="skel skel-slot"></div>'.repeat(8) + '</div>';
  else if (step === 'details') host.innerHTML = wizDetailsHTML();
  else host.innerHTML = wizReviewHTML();
  const el = host.firstElementChild;
  if (el) { el.classList.add('wiz-step'); el.style.animation = anim + ' .34s cubic-bezier(.22,.61,.36,1) both'; }
  if (step === 'date') wireWizDate();
  if (step === 'time') loadSlots();
  if (step === 'details') wireWizDetails();
  if (step === 'review') wireWizReview();
  wizRenderFoot();
}

function wizRenderFoot() {
  const { step, date, slot } = state.booking;
  const back = $('#wiz-back'), next = $('#wiz-next');
  back.style.visibility = step === 'date' ? 'hidden' : 'visible';
  if (step === 'review') {
    next.style.display = '';
    const box = $('#bk-consent');
    next.disabled = box ? !box.checked : false;
    next.innerHTML = '✓ Confirm booking';
    next.classList.add('wiz-confirm');
    next.onclick = submitBooking;
    return;
  }
  next.classList.remove('wiz-confirm');
  next.onclick = wizNext;
  next.style.display = '';
  next.disabled = (step === 'date' && !date) || (step === 'time' && !slot);
  next.innerHTML = step === 'details' ? 'Review booking →' : 'Continue →';
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
  if (step === 'date' && state.booking.date) wizGoto('time');
  else if (step === 'time' && state.booking.slot) wizGoto('details');
  else if (step === 'details') { if (wizValidate(true)) wizGoto('review'); }
}

/* --- step: date --- */
function wizDateHTML() {
  const days = [];
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(d); }
  return `<div>
    <div class="wiz-step-title">Pick a day</div>
    <div class="wiz-step-sub">Next two weeks at ${esc(state.clinic.name)}</div>
    <div class="date-row wiz-date-row" id="wiz-date-row">` +
    days.map((d, i) => {
      const iso = toISODate(d);
      return `<button class="date-pill" data-iso="${iso}">
        <div class="dow">${i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
        <div class="dnum">${d.getDate()}</div>
        <div class="dow">${d.toLocaleDateString('en-IN', { month: 'short' })}</div></button>`;
    }).join('') + `</div></div>`;
}
function wireWizDate() {
  $('#wiz-date-row').querySelectorAll('.date-pill').forEach(b => {
    b.onclick = () => {
      state.booking.date = b.dataset.iso;
      state.booking.slot = null;
      $('#wiz-date-row').querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
      b.classList.add('active');
      wizRenderLive();
      wizRenderFoot();
      setTimeout(() => wizGoto('time'), 260);
    };
  });
}

/* --- step: time (rich slot picker) --- */
async function loadSlots() {
  const { doctor, date } = state.booking;
  const host = $('#wiz-steps');
  try {
    const { slots } = await api(`/api/slots?doctor_id=${encodeURIComponent(doctor.id)}&date=${date}`);
    if (state.booking.step !== 'time') return;
    if (!slots.length) {
      host.innerHTML = `<div class="wiz-step" style="animation:stepFade .3s both">
        <div class="wiz-step-title">Pick a time</div>
        <div class="empty-note">Doctor is not available on ${esc(fmtDate(date))}. <a href="#" id="wiz-pick-other">Choose another day</a>.</div></div>`;
      const po = $('#wiz-pick-other'); if (po) po.onclick = e => { e.preventDefault(); wizGoto('date', 'back'); };
      return;
    }
    const firstOpen = slots.find(s => s.available);
    let si = 0;
    host.innerHTML = `<div class="wiz-step" style="animation:stepFade .3s both">
      <div class="wiz-step-title">Pick a time</div>
      <div class="wiz-step-sub">${esc(fmtDate(date))} · ${slots.filter(s => s.available).length} of ${slots.length} slots open</div>
      <div id="slot-grid">` +
      (() => {
        const groups = [['Morning', s => +s.time.slice(0, 2) < 12], ['Afternoon', s => +s.time.slice(0, 2) >= 12 && +s.time.slice(0, 2) < 17], ['Evening', s => +s.time.slice(0, 2) >= 17]];
        let html = '';
        for (const [label, match] of groups) {
          const g = slots.filter(match);
          if (!g.length) continue;
          html += `<div class="slot-group-label">${label}</div><div class="slot-grid">` + g.map(s => {
            const isNext = firstOpen && s.time === firstOpen.time;
            return `<button class="slot-btn ${isNext ? 'slot-next' : ''}" data-time="${s.time}" ${s.available ? '' : 'disabled'}
              style="animation-delay:${(si++ * 18)}ms">${fmtTime(s.time)}${isNext ? '<span class="slot-next-tag">next</span>' : ''}${s.available ? '' : '<span class="slot-taken-tag">taken</span>'}</button>`;
          }).join('') + '</div>';
        }
        return html;
      })() + `</div>
      <div class="slot-legend"><span><i class="lg lg-open"></i>Available</span><span><i class="lg lg-next"></i>Next up</span><span><i class="lg lg-taken"></i>Taken</span></div></div>`;
    const grid = $('#slot-grid');
    grid.querySelectorAll('.slot-btn:not(:disabled)').forEach(b => {
      b.onclick = () => {
        state.booking.slot = b.dataset.time;
        grid.querySelectorAll('.slot-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        wizRenderLive();
        wizRenderFoot();
        setTimeout(() => wizGoto('details'), 280);
      };
    });
    if (!slots.some(s => s.available)) {
      host.querySelector('.wiz-step').insertAdjacentHTML('beforeend',
        '<div class="empty-note">All slots are taken for this day. <a href="#" id="wiz-pick-other2">Try another date</a>.</div>');
      const po = $('#wiz-pick-other2'); if (po) po.onclick = e => { e.preventDefault(); wizGoto('date', 'back'); };
    }
  } catch (e) {
    if (state.booking.step === 'time') host.innerHTML = `<div class="empty-note">${esc(e.message)}</div>`;
  }
}

/* --- step: details --- */
function wizDetailsHTML() {
  const b = state.booking;
  const v = id => (b[id] || '').replace(/"/g, '&quot;');
  return `<div>
    <div class="wiz-step-title">Your details</div>
    <div class="wiz-step-sub">For ${esc(b.doctor.name)} · ${esc(fmtDateShort(b.date))} · ${fmtTime(b.slot)}</div>
    <div class="form-grid">
      <div class="form-2col">
        <div class="form-row"><label for="wz-name">Patient name</label><input id="wz-name" placeholder="Full name" maxlength="60" autocomplete="name" value="${v('pname')}"></div>
        <div class="form-row"><label for="wz-age">Age</label><input id="wz-age" placeholder="Age" inputmode="numeric" maxlength="3" value="${v('page')}"></div>
      </div>
      <div class="form-row"><label for="wz-phone">Mobile number</label>
        <div class="phone-wrap"><span class="phone-prefix">+91</span><input id="wz-phone" placeholder="98765 43210" inputmode="numeric" maxlength="10" autocomplete="tel-national" value="${v('pphone')}"></div>
      </div>
      <div class="form-row"><label for="wz-concern">Concern <span style="color:var(--muted);font-weight:400">(optional)</span></label><textarea id="wz-concern" rows="2" placeholder="e.g. fever since 2 days" maxlength="300">${esc(b.pconcern || '')}</textarea></div>
      <div class="form-error" id="wz-error"></div>
    </div></div>`;
}
function wireWizDetails() {
  $('#wz-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
  $('#wz-age').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3); });
  $('#wiz-next').disabled = false;
}
function wizValidate(showErr) {
  const name = $('#wz-name').value.trim();
  const phone = $('#wz-phone').value.trim();
  const age = $('#wz-age').value.trim();
  const concern = $('#wz-concern').value.trim();
  Object.assign(state.booking, { pname: name, pphone: phone, page: age, pconcern: concern });
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
    <label class="consent-row"><input type="checkbox" id="bk-consent"><span>I agree to Drayvenn Health storing my name, mobile number and booking details so the clinic can manage this appointment, as described in the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>. I can ask for my data to be deleted anytime.</span></label>
    <div class="form-error" id="bk-error2"></div>
    <div class="form-note" style="text-align:center;margin-top:2px">The clinic confirms your slot shortly.</div></div>`;
}
function wireWizReview() {
  const btn = $('#wiz-next');
  const box = $('#bk-consent');
  if (!box) return;
  box.checked = false;
  btn.disabled = true;
  box.onchange = () => { btn.disabled = !box.checked; };
}

async function submitBooking() {
  const err = $('#bk-error2');
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
        phone: b.pphone, age: b.page, concern: b.pconcern,
        date: b.date, slot: b.slot, consent: true
      })
    });
    state.lastBooking = booking;
    closeWizard();
    renderConfirmation(booking);
    show('confirm');
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
    toast(e.message, 'error');
    const box = $('#bk-consent');
    btn.disabled = box ? !box.checked : false;
    btn.innerHTML = '✓ Confirm booking';
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
    details: `Booking ref ${b.ref} · Patient ${b.patient_name} · Fee ₹${b.fee} (pay at clinic) · Booked via Drayvenn Health`,
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
  $('#wa-bubble').innerHTML = `
    <div class="wa-head">✅ Drayvenn Health · Appointment booked</div>
    <div class="wa-row"><span class="k">Patient</span><span class="v">${esc(b.patient_name)}${b.age ? ' · ' + esc(b.age) + ' yrs' : ''}</span></div>
    <div class="wa-row"><span class="k">Doctor</span><span class="v">${esc(b.doctor_name)}</span></div>
    <div class="wa-row"><span class="k">Clinic</span><span class="v">${esc(b.clinic_name)}</span></div>
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
      </div>` : `<div style="text-align:center;margin-bottom:10px"><span class="status-badge status-cancelled">Cancelled</span></div>`}
      <div class="wa-row"><span class="k">Patient</span><span class="v">${esc(b.patient_name)}</span></div>
      <div class="wa-row"><span class="k">Doctor</span><span class="v">${esc(b.doctor_name)} (${esc(b.specialty)})</span></div>
      <div class="wa-row"><span class="k">Clinic</span><span class="v">${esc(b.clinic_name)}, ${esc(b.clinic_area)}</span></div>
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
$('#home-search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  state.filter.q = e.target.value;
  $('#search-input').value = e.target.value;
  renderBrowse();
  show('clinics');
});
$('#view-all-clinics').onclick = e => { e.preventDefault(); show('clinics'); };
document.querySelectorAll('#browse-seg .seg-btn').forEach(b => b.onclick = () => {
  state.browse = b.dataset.seg;
  document.querySelectorAll('#browse-seg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $('#clinics-pane').classList.toggle('hidden', state.browse !== 'clinics');
  $('#doctors-pane').classList.toggle('hidden', state.browse !== 'doctors');
  renderBrowse();
});
document.querySelectorAll('#clinic-view-toggle .seg-btn').forEach(b => b.onclick = () => setMapMode(b.dataset.vt));
$('#logo-home').onclick = () => show('home');
$('#back-home').onclick = () => show('home');
$('#confirm-home').onclick = () => show('home');
$('#back-home-3').onclick = () => show('home');
$('#back-home-4').onclick = () => show('home');
$('#foot-clinics').onclick = e => { e.preventDefault(); show('clinics'); };
$('#foot-track').onclick = e => { e.preventDefault(); show('mybookings'); };
$('#foot-signin').onclick = e => { e.preventDefault(); showSignin(); };
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
  if (navigator.share) { try { await navigator.share({ title: 'Drayvenn Health appointment', text }); } catch {} }
  else { try { await navigator.clipboard.writeText(text); toast('Details copied - paste anywhere to share', 'info'); } catch {} }
};
$('#confirm-manage').onclick = () => {
  const b = state.lastBooking;
  show('mybookings');
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
    show(t);
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
    $('#am-account').onclick = () => { closeAcctMenu(); show('mybookings'); };
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
    $('#am-track').onclick = () => { closeAcctMenu(); show('mybookings'); };
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
    const menu = $('#acct-menu');
    const opening = menu.classList.contains('hidden');
    if (opening) { renderAcctMenu(); menu.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    else closeAcctMenu();
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
      <h2 style="font-size:20px;font-weight:700">My bookings</h2>
      <p style="color:var(--muted);font-size:13.5px;margin:6px 0 14px">Sign in to see your booking history, with cancel and reschedule.</p>
      <button class="btn btn-block" id="acct-goto-signin">Sign in</button>`;
    $('#acct-goto-signin').onclick = showSignin;
    return;
  }
  const p = state.patient;
  host.innerHTML = `
    <h2 style="font-size:20px;font-weight:700">Hi${p.name ? ', ' + esc(p.name.split(' ')[0]) : ''}</h2>
    <p style="color:var(--muted);font-size:13.5px;margin:4px 0 14px">
      ${p.phone ? 'Signed in with ' + esc(maskPhone(p.phone)) : (p.email ? 'Signed in with ' + esc(p.email) : 'Signed in with Google')}
      ${p.has_google ? ' &middot; Google linked' + (p.google_email ? ' (' + esc(p.google_email) + ')' : '') : ''}
    </p>
    ${!p.has_google ? '<a class="btn btn-block google-start" href="/api/auth/google/start" style="margin-bottom:14px;display:block;text-align:center">Link Google account</a>' : ''}
    <div class="form-grid" style="margin-bottom:14px">
      <div class="form-row"><label for="acct-name">Your name</label><input id="acct-name" maxlength="60" autocomplete="name" value="${esc(p.name || '')}" placeholder="Used to prefill bookings"></div>
      <div class="form-row"><label for="acct-age">Age</label><input id="acct-age" inputmode="numeric" maxlength="3" value="${p.age != null ? p.age : ''}" placeholder="Optional"></div>
      <div class="form-error" id="acct-error"></div>
      <button class="btn btn-block" id="acct-save">Save details</button>
    </div>
    <h3 style="font-size:16px;font-weight:700;margin:6px 0 10px">My bookings</h3>
    <div id="my-bookings"><div class="loading">Loading&hellip;</div></div>
    <button class="btn btn-block btn-ghost" id="acct-logout" style="margin-top:16px">Sign out</button>`;
  bindGoogleStart(host);
  $('#acct-save').onclick = saveProfile;
  $('#acct-logout').onclick = logout;
  loadMyBookings();
}

function renderLogin(host) {
  host.innerHTML = `
    <h2 style="font-size:20px;font-weight:700">Sign in to Drayvenn Health</h2>
    <p style="color:var(--muted);font-size:13.5px;margin:4px 0 16px">Faster booking with saved details, plus your full history with cancel and reschedule.</p>
    <div class="form-grid" id="login-phone-step">
      <div class="form-row"><label for="login-phone">Email address</label>
        <input id="login-phone" type="email" placeholder="you@example.com" autocomplete="email" style="width:100%">
      </div>
      <div class="form-error" id="login-error"></div>
      <button class="btn btn-block" id="login-send">Email me a login code</button>
    </div>
    <div class="form-grid hidden" id="login-otp-step">
      <div class="form-row"><label for="login-otp">6-digit code</label><input id="login-otp" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" inputmode="numeric" maxlength="6" autocomplete="one-time-code" style="letter-spacing:6px;text-align:center;font-size:18px"></div>
      <div class="form-error" id="otp-error"></div>
      <button class="btn btn-block" id="login-verify">Verify &amp; sign in</button>
      <button class="btn btn-block btn-ghost" id="login-back">Use a different email</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--muted);font-size:12px"><span style="flex:1;height:1px;background:var(--line,rgba(190,220,215,.4))"></span>or<span style="flex:1;height:1px;background:var(--line,rgba(190,220,215,.4))"></span></div>
    <a class="btn btn-block btn-ghost google-start" href="/api/auth/google/start" style="display:block;text-align:center">Continue with Google</a>
    <div class="privacy-line" style="margin-top:14px">Sign-in doubles as registration. Codes expire in 10 minutes.</div>`;
  $('#login-otp').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('#login-send').onclick = requestOtp;
  $('#login-verify').onclick = verifyOtp;
  $('#login-back').onclick = () => { $('#login-otp-step').classList.add('hidden'); $('#login-phone-step').classList.remove('hidden'); };
  bindGoogleStart(host);
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
  const email = $('#login-phone').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Enter a valid email address.'; err.style.display = 'block'; return; }
  const btn = $('#login-send');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    await api('/api/auth/otp/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    $('#login-phone-step').classList.add('hidden');
    $('#login-otp-step').classList.remove('hidden');
    $('#login-otp').focus();
  } catch (e) {
    err.textContent = e.message; err.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Email me a login code';
}

async function verifyOtp() {
  const err = $('#otp-error');
  err.style.display = 'none';
  const email = $('#login-phone').value.trim();
  const code = $('#login-otp').value.trim();
  if (!/^\d{6}$/.test(code)) { err.textContent = 'Enter the 6-digit code.'; err.style.display = 'block'; return; }
  const btn = $('#login-verify');
  btn.disabled = true; btn.textContent = 'Verifying...';
  try {
    const { patient } = await api('/api/auth/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
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

async function saveProfile() {
  const err = $('#acct-error');
  err.style.display = 'none';
  const name = $('#acct-name').value.trim();
  const age = $('#acct-age').value.trim();
  try {
    const { patient } = await api('/api/auth/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, age: age === '' ? null : age }) });
    state.patient.name = patient.name; state.patient.age = patient.age;
    toast('Details saved', 'info');
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  state.patient = null;
  toast('Signed out', 'info');
  renderAccount();
  renderAcctMenu();
}

async function loadMyBookings() {
  const host = $('#my-bookings');
  if (!host) return;
  try {
    const { bookings } = await api('/api/my/bookings');
    if (!bookings.length) { host.innerHTML = '<div class="loading">No bookings yet - book from the home page and they show up here.</div>'; return; }
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    host.innerHTML = bookings.map(b => `
      <div class="booking-row" data-ref="${esc(b.ref)}">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <div style="font-weight:700">${esc(b.doctor_name)} <span style="color:var(--muted);font-weight:500">&middot; ${esc(b.specialty || '')}</span></div>
            <div style="font-size:13px;color:var(--muted)">${esc(b.clinic_name)}</div>
            <div style="font-size:13px;margin-top:2px">${fmtDate(b.date)} &middot; ${fmtTime(b.slot)} &middot; <span class="status-${esc(b.status)}">${esc(b.status)}</span></div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px">${esc(b.ref)}</div>
          </div>
          ${b.status !== 'cancelled' && b.date >= today ? `<span class="menu-host"><button class="menu-dot" data-ref="${esc(b.ref)}" aria-label="Manage">&#8942;</button>
          <span class="menu-pop menu-pop-right hidden">
            <button class="menu-item" data-act="reschedule" data-ref="${esc(b.ref)}" data-doctor="${esc(b.doctor_id)}">Reschedule</button>
            <button class="menu-item menu-danger" data-act="cancel" data-ref="${esc(b.ref)}">Cancel booking</button>
          </span></span>` : ''}
        </div>
        <div class="rs-panel hidden"></div>
      </div>`).join('');
    host.querySelectorAll('.menu-dot').forEach(btn => btn.onclick = () => {
      const menu = btn.parentElement.querySelector('.menu-pop');
      menu.classList.toggle('hidden');
    });
    host.querySelectorAll('.menu-item').forEach(btn => btn.onclick = () => {
      const row = btn.closest('.booking-row');
      btn.closest('.menu-pop').classList.add('hidden');
      if (btn.dataset.act === 'cancel') myCancel(row, btn.dataset.ref);
      else myReschedulePanel(row, btn.dataset.ref, btn.dataset.doctor);
    });
  } catch (e) {
    host.innerHTML = '<div class="loading">Could not load bookings. <a href="#" id="my-retry">Retry</a></div>';
    const r = $('#my-retry'); if (r) r.onclick = ev => { ev.preventDefault(); loadMyBookings(); };
  }
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
  if (q.get('login') === 'google') { toast('Signed in with Google', 'info'); history.replaceState(null, '', location.pathname + location.hash); }
  if (q.get('linked') === 'google') { toast('Google account linked', 'info'); history.replaceState(null, '', location.pathname + location.hash); }
})();

window.openClinicFromChat = openClinic;
window.showFromChat = show;
loadClinics();
initAcctMenu();
loadPatient().then(() => { renderAcctMenu(); if (!$('#view-mybookings').classList.contains('hidden')) renderAccount(); });
