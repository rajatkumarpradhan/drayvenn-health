const state = {
  clinics: [],
  filter: { q: '', spec: 'All' },
  clinic: null,
  booking: { doctor: null, date: null, slot: null },
  lastBooking: null
};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function show(view) {
  for (const v of ['home', 'clinic', 'confirm', 'mybookings']) {
    const el = document.getElementById('view-' + v);
    el.classList.toggle('hidden', v !== view);
    if (v === view) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
    }
  }
  const tabFor = { home: 'home', clinic: 'home', confirm: 'home', mybookings: 'mybookings' };
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
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

/* ---------- HOME ---------- */
async function loadClinics() {
  try {
    const { clinics } = await api('/api/clinics');
    state.clinics = clinics;
    renderSpecChips();
    renderClinics();
  } catch (e) {
    $('#clinic-list').innerHTML = '<div class="loading">Could not load clinics. <a href="#" onclick="location.reload();return false">Retry</a></div>';
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
    b.onclick = () => { state.filter.spec = s; renderSpecChips(); renderClinics(); };
    host.appendChild(b);
  }
}

function renderClinics() {
  const q = state.filter.q.toLowerCase();
  const list = state.clinics.filter(c => {
    const inSpec = state.filter.spec === 'All' || c.specialties.includes(state.filter.spec);
    if (!inSpec) return false;
    if (!q) return true;
    const hay = [c.name, c.area, c.tagline, c.specialties.join(' '), c.doctors.map(d => d.name + ' ' + d.specialty).join(' ')].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const host = $('#clinic-list');
  if (!list.length) {
    host.innerHTML = '<div class="loading">No clinics match that search.</div>';
    return;
  }
  host.innerHTML = list.map((c, i) => `
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
    </div>`).join('');
  host.querySelectorAll('.clinic-card').forEach(el => {
    el.onclick = () => openClinic(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClinic(el.dataset.id); } };
  });
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
    renderClinicDetail();
  } catch (e) {
    $('#clinic-detail').innerHTML = '<div class="loading">Clinic not found.</div>';
  }
}

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
    </div>`;
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
      </div>
    </div>`).join('');
  $('#doctor-list').querySelectorAll('button[data-doc]').forEach(b => {
    b.onclick = () => openBooking(b.dataset.doc);
  });
}

/* ---------- BOOKING WIZARD (v7) ---------- */
const WIZ_STEPS = ['date', 'time', 'details', 'review'];
const WIZ_LABELS = { date: 'Date', time: 'Time', details: 'Details', review: 'Confirm' };

function openBooking(doctorId) {
  const doctor = state.clinic.doctors.find(d => d.id === doctorId);
  state.booking = { doctor, date: null, slot: null, step: 'date' };
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
      <div class="slot-grid" id="slot-grid">` +
      slots.map(s => {
        const isNext = firstOpen && s.time === firstOpen.time;
        return `<button class="slot-btn ${isNext ? 'slot-next' : ''}" data-time="${s.time}" ${s.available ? '' : 'disabled'}
          style="animation-delay:${(si++ * 22)}ms">${fmtTime(s.time)}${isNext ? '<span class="slot-next-tag">next</span>' : ''}${s.available ? '' : '<span class="slot-taken-tag">taken</span>'}</button>`;
      }).join('') + `</div>
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
$('#search-input').addEventListener('input', e => { state.filter.q = e.target.value; renderClinics(); });
$('#logo-home').onclick = () => show('home');
$('#back-home').onclick = () => show('home');
$('#confirm-home').onclick = () => show('home');
$('#nav-bookings').onclick = e => { e.preventDefault(); show('mybookings'); };
$('#back-home-3').onclick = () => show('home');
$('#bk-btn').onclick = lookupBooking;
$('#bk-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
$('#bk-phone').addEventListener('keydown', e => { if (e.key === 'Enter') lookupBooking(); });
$('#bk-ref').addEventListener('keydown', e => { if (e.key === 'Enter') lookupBooking(); });
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
    if (t === 'chat') {
      if (window.chatIsOpen && window.chatIsOpen()) window.closeChat();
      else window.openChat && window.openChat();
      return;
    }
    if (window.closeChat) window.closeChat();
    show(t);
  });
});

window.openClinicFromChat = openClinic;
window.showFromChat = show;
loadClinics();
