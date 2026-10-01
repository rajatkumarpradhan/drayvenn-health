const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const auth = { token: sessionStorage.getItem('dh_admin_token') || null, clinicName: sessionStorage.getItem('dh_admin_clinic') || null };
let currentDate = todayISO();
let bookingsCache = [];
let statusFilter = 'all';
let doctorFilter = 'all';
let searchQuery = '';

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function shiftISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayISO.call ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : null;
}
function fmtTime(t) {
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
function fmtDayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (iso === todayISO()) return 'Today';
  if (iso === shiftISO(todayISO(), 1)) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function toast(msg, kind) {
  const host = document.getElementById('toast-host');
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || 'info');
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
async function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers, auth.token ? { Authorization: 'Bearer ' + auth.token } : {});
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth.token) { logout(true); }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

const ON_PORTAL = location.pathname.indexOf('/clinic-admin/platform') === 0;
function toPortalLogin(expired) { location.replace('/clinic-admin/login' + (expired ? '?expired=1' : '')); }
async function init() {
  $('#dash-date').value = todayISO();
  if (ON_PORTAL && !auth.token) { toPortalLogin(); return; }
  if (auth.token && sessionStorage.getItem('dh_admin_role') === 'platform') { return; /* shown by admin-portal.js once loaded */ }
  if (auth.token) {
    try {
      await loadBookings();
      showDash();
    } catch (e) { /* session invalid */ if (ON_PORTAL) { sessionStorage.removeItem('dh_admin_token'); toPortalLogin(true); } }
  }
}

function showDash() {
  $('#admin-login-view').classList.add('hidden');
  $('#admin-dash-view').classList.remove('hidden');
  $('#dash-clinic-name').textContent = (auth.clinicName || '') + (sessionStorage.getItem('dh_admin_role') === 'doctor' ? ' - ' + (sessionStorage.getItem('dh_admin_doctor') || 'Doctor') : '');
  if (window.portalInit) portalInit(sessionStorage.getItem('dh_admin_role') || 'clinic');
  loadSummary();
}

async function login() {
  const err = $('#adm-error');
  err.style.display = 'none';
  const email = $('#adm-email').value.trim();
  const password = $('#adm-password').value;
  if (!email || !password) {
    err.textContent = 'Enter your clinic email and password.';
    err.style.display = 'block';
    return;
  }
  const btn = $('#adm-login-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const data = await api('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    auth.token = data.token;
    auth.clinicName = data.clinic.name;
    auth.role = data.role || 'clinic'; auth.doctorName = data.doctor_name || '';
    sessionStorage.setItem('dh_admin_role', auth.role); sessionStorage.setItem('dh_admin_doctor', auth.doctorName);
    sessionStorage.setItem('dh_admin_token', data.token);
    sessionStorage.setItem('dh_admin_clinic', data.clinic.name);
    if (data.role === 'platform') { auth.clinicName = 'Drayvenn Lab team'; window.portalPlatformShow(); toast('Signed in as Drayvenn Lab team', 'success'); return; }
    currentDate = todayISO();
    $('#dash-date').value = currentDate;
    await loadBookings();
    showDash();
    toast('Signed in as ' + data.clinic.name, 'success');
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open dashboard';
  }
}

function logout(expired) {
  fetch('/api/admin/logout', { method: 'POST', headers: { 'X-DH-Admin': '1' } }).catch(() => {});
  auth.token = null;
  auth.clinicName = null;
  sessionStorage.removeItem('dh_admin_token');
  sessionStorage.removeItem('dh_admin_clinic'); sessionStorage.removeItem('dh_admin_role'); sessionStorage.removeItem('dh_admin_doctor');
  if (window.portalReset) portalReset();
  $('#admin-dash-view').classList.add('hidden');
  $('#admin-login-view').classList.remove('hidden');
  if (ON_PORTAL) { toPortalLogin(!!expired); return; }
  if (expired) toast('Session expired - sign in again', 'error');
}

async function loadBookings() {
  const data = await api(`/api/admin/bookings?date=${currentDate}`);
  bookingsCache = data.bookings;
  $('#dash-clinic-name').textContent = data.clinic.name;
  const c = data.counts;
  $('#stat-row').innerHTML = `
    <div class="stat-card"><div class="num">${c.total}</div><div class="lbl">Total</div></div>
    <div class="stat-card"><div class="num" style="color:var(--amber)">${c.pending || 0}</div><div class="lbl">Pending</div></div>
    <div class="stat-card"><div class="num" style="color:var(--green)">${c.confirmed || 0}</div><div class="lbl">Confirmed</div></div>
    <div class="stat-card"><div class="num" style="color:var(--red)">${c.cancelled || 0}</div><div class="lbl">Cancelled</div></div>`;
  renderDayLabel();
  renderDoctorChips();
  renderList();
}

function renderDoctorChips() {
  const host = $('#doctor-row');
  const doctors = [...new Set(bookingsCache.map(b => b.doctor_name))];
  if (doctors.length < 2) { host.innerHTML = ''; return; }
  if (doctorFilter !== 'all' && !doctors.includes(doctorFilter)) doctorFilter = 'all';
  host.innerHTML = ['all', ...doctors].map(d =>
    `<button class="filter-chip doc-chip ${doctorFilter === d ? 'active' : ''}" data-doc="${esc(d)}">${d === 'all' ? 'All doctors' : esc(d.replace('Dr. ', 'Dr '))}</button>`
  ).join('');
  host.querySelectorAll('.doc-chip').forEach(ch => {
    ch.onclick = () => { doctorFilter = ch.dataset.doc; renderDoctorChips(); renderList(); };
  });
}

function renderDayLabel() {
  $('#day-label').textContent = fmtDayLabel(currentDate);
  $('#dash-date').value = currentDate;
}

function renderList() {
  const host = $('#booking-host');
  let list = bookingsCache;
  if (statusFilter !== 'all') list = list.filter(b => b.status === statusFilter);
  if (doctorFilter !== 'all') list = list.filter(b => b.doctor_name === doctorFilter);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(b => [b.patient_name, b.phone, b.ref].join(' ').toLowerCase().includes(q));
  }
  document.querySelectorAll('.filter-chip').forEach(ch => {
    ch.classList.toggle('active', ch.dataset.filter === statusFilter);
  });
  if (!list.length) {
    host.innerHTML = `<div class="loading">${searchQuery ? 'No bookings match that search.' : statusFilter === 'all' ? 'No bookings for this day yet.' : 'No ' + statusFilter + ' bookings this day.'}</div>`;
    return;
  }
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const isToday = currentDate === todayISO();
  let nextId = null;
  if (isToday) {
    const upcoming = bookingsCache.filter(b => b.status !== 'cancelled' && (parseInt(b.slot.slice(0, 2)) * 60 + parseInt(b.slot.slice(3))) >= nowMins);
    if (upcoming.length) nextId = upcoming[0].id;
  }
  host.innerHTML = list.map((b, i) => `
    <div class="booking-row ${b.id === nextId ? 'next-up' : ''}" data-id="${b.id}" style="animation-delay:${i * 35}ms">
      <div class="bk-time">${fmtTime(b.slot)}${b.id === nextId ? '<div class="next-tag">NEXT UP</div>' : ''}</div>
      <div class="bk-avatar">${esc(b.patient_name.trim().charAt(0).toUpperCase())}</div>
      <div class="bk-main">
        <div class="bk-name">${esc(b.patient_name)}${b.age ? ' · ' + b.age + ' yrs' : ''} <span class="status-badge status-${b.status}">${b.status}</span>${b.prior_visits > 0 ? ` <span class="visit-badge">↻ ${b.prior_visits + 1}${['th','st','nd','rd'][(b.prior_visits + 1) % 10] || 'th'} visit</span>` : ''}</div>
        <div class="bk-sub">${esc(b.doctor_name)} · 📞 <a href="tel:${esc(b.phone)}" style="color:inherit">${esc(b.phone)}</a> · Ref ${esc(b.ref)}</div>
        ${b.concern ? `<div class="bk-concern">“${esc(b.concern)}”</div>` : ''}
      </div>
      <div class="bk-actions">
        ${b.status === 'pending' ? `<button class="btn btn-small" data-act="confirm" data-id="${b.id}">Confirm</button>` : ''}
        ${b.status !== 'cancelled' ? `
        <div class="menu-host">
          <button class="menu-dot" aria-label="More actions">⋮</button>
          <div class="menu-pop menu-pop-right hidden">
            <a class="menu-item" href="tel:${esc(b.phone)}">Call patient</a>
            <button class="menu-item" data-act="copy" data-id="${b.id}">Copy booking ref</button>
            <button class="menu-item" data-act="reschedule" data-id="${b.id}">Reschedule</button>
            <button class="menu-item menu-danger" data-act="cancel" data-id="${b.id}">Cancel booking</button>
          </div>
        </div>` : ''}
      </div>
    </div>`).join('');
  host.querySelectorAll('.menu-dot').forEach(dot => {
    dot.onclick = e => {
      e.stopPropagation();
      const pop = dot.parentElement.querySelector('.menu-pop');
      const wasHidden = pop.classList.contains('hidden');
      document.querySelectorAll('.menu-pop').forEach(x => x.classList.add('hidden'));
      if (wasHidden) pop.classList.remove('hidden');
    };
  });
  host.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = async e => {
      e.stopPropagation();
      if (btn.dataset.act === 'copy') {
        const b = bookingsCache.find(x => x.id === parseInt(btn.dataset.id));
        if (b) {
          try {
            await navigator.clipboard.writeText(b.ref);
            toast('Ref ' + b.ref + ' copied', 'info');
          } catch {
            toast('Ref: ' + b.ref, 'info');
          }
        }
        document.querySelectorAll('.menu-pop').forEach(x => x.classList.add('hidden'));
        return;
      }
      if (btn.dataset.act === 'reschedule') {
        document.querySelectorAll('.menu-pop').forEach(x => x.classList.add('hidden'));
        openReschedule(parseInt(btn.dataset.id));
        return;
      }
      if (btn.dataset.act === 'cancel' && !btn.dataset.armed) {
        btn.dataset.armed = '1';
        btn.textContent = 'Tap again to cancel';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Cancel booking'; } }, 3000);
        return;
      }
      document.querySelectorAll('.menu-pop').forEach(x => x.classList.add('hidden'));
      act(btn.dataset.id, btn.dataset.act, btn);
    };
  });
}

document.addEventListener('click', () => {
  document.querySelectorAll('.menu-pop').forEach(x => x.classList.add('hidden'));
});

/* ---------- RESCHEDULE ---------- */
function openReschedule(id) {
  document.querySelectorAll('.rs-panel').forEach(x => x.remove());
  const b = bookingsCache.find(x => x.id === id);
  if (!b) return;
  const row = document.querySelector(`.booking-row[data-id="${id}"]`);
  if (!row) return;
  const panel = document.createElement('div');
  panel.className = 'rs-panel';
  const today = todayISO();
  const max = new Date(); max.setDate(max.getDate() + 13);
  const maxISO = max.toISOString().slice(0, 10);
  panel.innerHTML = `
    <div class="rs-title">Reschedule ${esc(b.patient_name)} - ${esc(b.doctor_name)}</div>
    <div class="rs-grid">
      <input type="date" id="rs-date" min="${today}" max="${maxISO}" value="${b.date}">
      <select id="rs-slot"><option value="">Pick a date first</option></select>
      <button class="btn btn-small" id="rs-save">Save</button>
      <button class="btn btn-ghost btn-small" id="rs-close">Close</button>
    </div>
    <div class="form-error" id="rs-error"></div>`;
  row.after(panel);
  const dateEl = panel.querySelector('#rs-date');
  const slotEl = panel.querySelector('#rs-slot');
  const errEl = panel.querySelector('#rs-error');
  const loadSlots = async () => {
    slotEl.innerHTML = '<option value="">Loading...</option>';
    try {
      const data = await api(`/api/slots?doctor_id=${encodeURIComponent(b.doctor_id)}&date=${dateEl.value}`);
      const free = data.slots.filter(x => x.available);
      slotEl.innerHTML = free.length
        ? '<option value="">Choose new time</option>' + free.map(x => `<option value="${x.time}">${fmtTime(x.time)}</option>`).join('')
        : '<option value="">No free slots that day</option>';
    } catch (e) {
      slotEl.innerHTML = '<option value="">Could not load slots</option>';
    }
  };
  dateEl.onchange = loadSlots;
  loadSlots();
  panel.querySelector('#rs-close').onclick = () => panel.remove();
  panel.querySelector('#rs-save').onclick = async ev => {
    const btn2 = ev.currentTarget;
    errEl.style.display = 'none';
    if (!slotEl.value) { errEl.textContent = 'Pick a new time slot.'; errEl.style.display = 'block'; return; }
    btn2.disabled = true;
    try {
      await api(`/api/admin/bookings/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', date: dateEl.value, slot: slotEl.value })
      });
      toast(`Moved to ${fmtTime(slotEl.value)} on ${dateEl.value}`, 'success');
      if (dateEl.value !== currentDate) {
        $('#dash-date').value = dateEl.value;
        currentDate = dateEl.value;
      }
      await loadBookings();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn2.disabled = false;
    }
  };
}

async function act(id, action, btn) {
  btn.disabled = true;
  try {
    const r = await api(`/api/admin/bookings/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const b = bookingsCache.find(x => x.id === parseInt(id));
    await loadBookings();
    toast(action === 'confirm' ? `Confirmed ${b ? b.patient_name : 'booking'} at ${b ? fmtTime(b.slot) : ''}` : 'Booking cancelled', action === 'confirm' ? 'success' : 'info');
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
  }
}

async function loadSummary() {
  try {
    const { today, days } = await api('/api/admin/summary');
    const host = $('#week-strip');
    let html = '';
    for (let i = 0; i < 7; i++) {
      const iso = shiftISO(today, i);
      const d = new Date(iso + 'T00:00:00');
      const info = days[iso] || { total: 0, pending: 0 };
      html += `<button class="week-day ${iso === currentDate ? 'active' : ''}" data-date="${iso}">
        <div class="wd-dow">${i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
        <div class="wd-num">${d.getDate()}</div>
        <div class="wd-count">${info.total ? info.total + (info.pending ? ' <span class=wd-pend>●</span>' : '') : '—'}</div>
      </button>`;
    }
    host.innerHTML = html;
    host.querySelectorAll('.week-day').forEach(b => {
      b.onclick = () => { currentDate = b.dataset.date; loadBookings().then(renderDayLabel); document.querySelectorAll('.week-day').forEach(x => x.classList.toggle('active', x === b)); };
    });
  } catch (e) { /* summary is optional */ }
}

$('#adm-login-btn').onclick = login;
$('#adm-password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#adm-email').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#pin-toggle').onclick = () => {
  const p = $('#adm-password');
  p.type = p.type === 'password' ? 'text' : 'password';
  $('#pin-toggle').textContent = p.type === 'password' ? 'Show' : 'Hide';
};
$('#dash-refresh').onclick = () => { loadBookings(); loadSummary(); toast('Refreshed', 'info'); };
$('#dash-date').onchange = () => { currentDate = $('#dash-date').value || todayISO(); loadBookings(); loadSummary(); };
$('#day-prev').onclick = () => { currentDate = shiftISO(currentDate, -1); loadBookings(); loadSummary(); };
$('#day-next').onclick = () => { currentDate = shiftISO(currentDate, 1); loadBookings(); loadSummary(); };
$('#day-today').onclick = () => { currentDate = todayISO(); loadBookings(); loadSummary(); };
$('#dash-logout').onclick = () => logout(false);
$('#admin-search-input').addEventListener('input', e => { searchQuery = e.target.value.trim(); renderList(); });
document.querySelectorAll('.filter-chip').forEach(ch => {
  ch.onclick = () => { statusFilter = ch.dataset.filter; renderList(); };
});

init();
