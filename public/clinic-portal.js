(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role0 = sessionStorage.getItem('dh_admin_role') || 'clinic';
  if (!sessionStorage.getItem('dh_admin_role')) { location.replace('/clinic-admin/login'); return; }
  if (role0 === 'platform') { location.replace('/clinic-admin/platform'); return; }
  const IS_DOC = role0 === 'doctor';

  const ICON = {
    dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    pending: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    doctors: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
    slots: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8 14h3M13 14h3M8 18h3"/></svg>',
    appointments: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
  };
  const ROUTES = [
    ['dashboard', 'Dashboard'], ['pending', 'Pending'], ['doctors', 'Doctors'],
    ['slots', 'Slots'], ['appointments', 'Appointments'], ['settings', 'Settings']
  ].filter(r => !(IS_DOC && (r[0] === 'doctors' || r[0] === 'settings')));
  const route = () => { const m = location.pathname.match(/\/clinic-admin\/([a-z]+)/); const r = m && ROUTES.some(x => x[0] === m[1]) ? m[1] : 'dashboard'; return r; };

  /* ---------- helpers ---------- */
  function toast(msg, bad) { const t = $('#cp-toast'); t.textContent = msg; t.className = 'cp-toast show' + (bad ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'cp-toast', 3200); }
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'X-DH-Admin': '1' }, opts.body ? { 'Content-Type': 'application/json' } : {});
    const res = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { ['dh_admin_token', 'dh_admin_role', 'dh_admin_clinic', 'dh_admin_doctor'].forEach(k => sessionStorage.removeItem(k)); location.replace('/clinic-admin/login?expired=1'); throw new Error('Session expired'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  const fmtTime = t => { const [h, m] = t.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); };
  const D = iso => new Date(iso + 'T00:00:00Z');
  const fmtDay = iso => D(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const dayLabel = (iso, today) => iso === today ? 'Today' : fmtDay(iso);
  const initials = n => (n || '?').replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const chip = s => `<span class="cp-chip ${esc(s)}">${esc(s[0].toUpperCase() + s.slice(1))}</span>`;
  function busy(btn, label, fn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label;
    return Promise.resolve().then(fn).finally(() => { btn.disabled = false; btn.textContent = old; });
  }
  function modal(html) { const m = $('#cp-modal'); m.innerHTML = '<div class="cp-sheet">' + html + '</div>'; m.classList.remove('hidden'); m.onclick = e => { if (e.target === m) closeModal(); }; }
  function closeModal() { const m = $('#cp-modal'); m.classList.add('hidden'); m.innerHTML = ''; }

  /* ---------- shell ---------- */
  let pendingCount = 0, knownPending = null, ctx = { today: null };
  function renderNav() {
    const cur = route();
    const link = r => `<a href="/clinic-admin/${r[0]}" data-r="${r[0]}" class="${cur === r[0] ? 'on' : ''}">${ICON[r[0]]}<span>${r[1]}</span>${r[0] === 'pending' && pendingCount ? `<span class="cp-badge">${pendingCount}</span>` : ''}</a>`;
    $('#cp-nav').innerHTML = ROUTES.map(link).join('');
    $('#cp-tabbar').innerHTML = ROUTES.map(r => `<a href="/clinic-admin/${r[0]}" data-r="${r[0]}" class="${cur === r[0] ? 'on' : ''}">${ICON[r[0]]}<span>${r[1] === 'Appointments' ? 'Visits' : r[1]}</span>${r[0] === 'pending' && pendingCount ? `<span class="cp-badge">${pendingCount}</span>` : ''}</a>`).join('');
    document.title = (pendingCount ? '(' + pendingCount + ') ' : '') + 'Clinic Portal - Drayvenn Lab';
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-r]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href')); go();
  });
  window.addEventListener('popstate', go);
  $('#cp-out').onclick = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST', headers: { 'X-DH-Admin': '1' } }); } catch (e) { /* cookie expires on its own */ }
    ['dh_admin_token', 'dh_admin_role', 'dh_admin_clinic', 'dh_admin_doctor'].forEach(k => sessionStorage.removeItem(k));
    location.href = '/clinic-admin/login';
  };

  const PAGES = { dashboard: pgDashboard, pending: pgPending, doctors: pgDoctors, slots: pgSlots, appointments: pgAppointments, settings: pgSettings };
  async function go() {
    renderNav(); closeModal();
    const r = route();
    const main = $('#cp-main');
    main.innerHTML = '<div class="cp-loading">Loading...</div>';
    window.scrollTo(0, 0);
    try { await PAGES[r](main); }
    catch (e) { if (e.message !== 'Session expired') main.innerHTML = `<div class="cp-empty"><b>Could not load this page</b>${esc(e.message)}<br><br><button class="cp-btn" id="cp-retry">Try again</button></div>`; const b = $('#cp-retry'); if (b) b.onclick = go; }
  }

  /* ---------- pending poll (near real time) ---------- */
  async function pollPending(initial) {
    try {
      const d = await api('/api/admin/appointments?scope=pending');
      const ids = new Set(d.bookings.map(b => b.id));
      const fresh = knownPending ? d.bookings.filter(b => !knownPending.has(b.id)) : [];
      knownPending = ids;
      const changed = pendingCount !== d.bookings.length;
      pendingCount = d.bookings.length;
      if (changed) renderNav();
      if (fresh.length && !initial) {
        toast(fresh.length === 1 ? 'New booking request from ' + fresh[0].patient_name : fresh.length + ' new booking requests');
        const r = route();
        if ((r === 'pending' || r === 'dashboard') && $('#cp-modal').classList.contains('hidden')) PAGES[r]($('#cp-main'), d);
      } else if (changed && !initial && route() === 'pending' && $('#cp-modal').classList.contains('hidden')) PAGES.pending($('#cp-main'), d);
    } catch (e) { /* transient */ }
  }
  setInterval(() => { if (!document.hidden) pollPending(false); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollPending(false); });

  /* ---------- booking card ---------- */
  function bkCard(b, o) {
    o = o || {};
    return `<div class="cp-bk" data-id="${b.id}">
      <div class="cp-time">${esc(fmtTime(b.slot))}<small>${esc(dayLabel(b.date, ctx.today))}</small></div>
      <div><div class="nm">${esc(b.patient_name)}${b.age ? ', ' + esc(b.age) : ''}${o.chip ? chip(b.status) : ''}</div>
        <div class="mt">${esc(b.doctor_name)} &middot; <b>${esc(b.ref)}</b><br><a href="tel:${esc(b.phone)}">+91 ${esc(b.phone)}</a>${b.concern ? ' &middot; ' + esc(b.concern) : ''}</div></div>
      <div class="cp-acts">${o.actions || ''}</div></div>`;
  }
  function wireActions(root, after) {
    root.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
      const card = btn.closest('.cp-bk'), id = card.dataset.id, act = btn.dataset.act;
      if (act === 'reject' || act === 'cancel') {
        if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Tap again to ' + (act === 'reject' ? 'reject' : 'cancel'); btn.classList.add('badf'); btn.classList.remove('bad'); setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = act === 'reject' ? 'Reject' : 'Cancel'; btn.classList.remove('badf'); btn.classList.add('bad'); } }, 3000); return; }
      }
      card.querySelectorAll('button').forEach(x => x.disabled = true);
      try {
        await api('/api/admin/bookings/' + id, { body: { action: act === 'confirm' ? 'confirm' : 'cancel' } });
        card.classList.add('gone');
        toast(act === 'confirm' ? 'Booking confirmed' : act === 'reject' ? 'Booking rejected' : 'Booking cancelled');
        setTimeout(() => { after && after(); }, 260);
      } catch (e) { toast(e.message, true); card.querySelectorAll('button').forEach(x => x.disabled = false); }
    });
  }
  const PEND_ACTS = '<button class="cp-btn ok" data-act="confirm">Confirm</button><button class="cp-btn bad" data-act="reject">Reject</button>';

  /* ---------- Dashboard ---------- */
  async function pgDashboard(main) {
    const o = await api('/api/admin/overview'); ctx.today = o.today;
    pendingCount = o.pending_total; if (!knownPending) knownPending = new Set(o.recent_pending.map(x => x.id)); renderNav();
    const max = Math.max(1, ...o.days.map(d => d.n));
        main.innerHTML = `<h1 class="cp-h1">Welcome, ${esc(o.clinic_name)}</h1>
      <p class="cp-sub">${esc(fmtDay(o.today))} &middot; ${o.pending_total ? '<b>' + o.pending_total + ' pending</b> and <b>' + o.today_counts.confirmed + ' confirmed today</b>.' : 'nothing pending, <b>' + o.today_counts.confirmed + ' confirmed today</b>.'}</p>
      <a class="cp-hero${o.pending_total ? '' : ' calm'}" href="/clinic-admin/pending" data-r="pending">
        <div><div class="l">Total pending</div><div class="big">${o.pending_total}</div><div class="s">${o.pending_total ? 'bookings waiting for you to confirm or reject' : 'You are all caught up'}</div></div>
        <span class="cp-btn">${o.pending_total ? 'Review now' : 'Open'}</span></a>
      <div class="cp-stats">
        <div class="cp-stat ok"><div class="n">${o.today_counts.confirmed}</div><div class="l">Today's confirmed appointments</div></div>
        <div class="cp-stat blue"><div class="n">${o.confirmation_rate == null ? '-' : o.confirmation_rate + '%'}</div><div class="l">Confirmation rate (30 days)</div></div>
        <div class="cp-stat"><div class="n">${o.upcoming7}</div><div class="l">Next 7 days</div></div>
      </div>
      <div class="cp-quick">
        <a href="/clinic-admin/pending" data-r="pending">${ICON.pending}<span>Pending</span></a>
        <a href="/clinic-admin/appointments" data-r="appointments">${ICON.appointments}<span>Appointments</span></a>
        <a href="/clinic-admin/slots" data-r="slots">${ICON.slots}<span>Manage slots</span></a>
        ${IS_DOC ? '' : `<a href="/clinic-admin/doctors" data-r="doctors">${ICON.doctors}<span>Doctors</span></a>`}
      </div>
      <div class="cp-card"><h3>Next 7 days<span style="font:600 12.5px Inter;color:var(--ca-mut)">${o.today_counts.confirmed} confirmed today</span></h3>
        <div class="cp-bars">${o.days.map((d, i) => `<div class="cp-bar${i === 0 ? ' today' : ''}"><b>${d.n}</b><i style="height:${Math.max(4, Math.round(d.n / max * 70))}px"></i><span>${i === 0 ? 'Today' : D(d.date).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</span></div>`).join('')}</div></div>
      <div class="cp-card"><h3>Recent pending bookings<a href="/clinic-admin/pending" data-r="pending">View all (${o.pending_total})</a></h3>
        <div class="cp-list" id="dash-pend">${o.recent_pending.length ? '' : '<div class="cp-empty"><b>All caught up</b>No bookings waiting for you.</div>'}</div></div>`;
    const host = $('#dash-pend');
    host.innerHTML += o.recent_pending.map(b => bkCard(b, { actions: PEND_ACTS })).join('');
    wireActions(host, () => { PAGES.dashboard(main); pollPending(true); });
  }

  /* ---------- Pending ---------- */
  async function pgPending(main, pre) {
    const d = pre || await api('/api/admin/appointments?scope=pending'); ctx.today = d.today;
    pendingCount = d.bookings.length; knownPending = new Set(d.bookings.map(b => b.id)); renderNav();
    main.innerHTML = `<h1 class="cp-h1">Pending bookings</h1><p class="cp-sub">${d.bookings.length ? d.bookings.length + ' waiting for your confirmation. New requests appear here automatically.' : 'New requests appear here automatically.'}</p>
      <div class="cp-list" id="pend-list">${d.bookings.length ? d.bookings.map(b => bkCard(b, { actions: PEND_ACTS })).join('') : '<div class="cp-empty"><b>No pending bookings</b>You are all caught up.</div>'}</div>`;
    wireActions($('#pend-list'), () => { PAGES.pending(main); pollPending(true); });
  }

  /* ---------- Appointments ---------- */
  let apTab = 'today', apAll = false;
  async function pgAppointments(main) {
    const d = await api('/api/admin/appointments?scope=' + apTab + (apAll ? '&all=1' : '')); ctx.today = d.today;
    const groups = {}; d.bookings.forEach(b => (groups[b.date] = groups[b.date] || []).push(b));
    const dates = Object.keys(groups);
    main.innerHTML = `<h1 class="cp-h1">Appointments</h1><p class="cp-sub">Confirmed visits. Past visits show the latest 100.</p>
      <div class="cp-tabs" id="ap-tabs">${['today', 'upcoming', 'past'].map(t => `<button data-t="${t}" class="${apTab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <label class="cp-row-opt"><input type="checkbox" id="ap-all" ${apAll ? 'checked' : ''}> Also show pending and cancelled</label>
      <div id="ap-list">${dates.length ? dates.map(dt => `<div class="cp-date-h">${esc(dayLabel(dt, d.today))}${dt === d.today ? '' : ' &middot; ' + esc(D(dt).toLocaleDateString('en-IN', { year: 'numeric', timeZone: 'UTC' }))}</div><div class="cp-list">${groups[dt].map(b => bkCard(b, { chip: true, actions: (apTab !== 'past' && b.status === 'confirmed') ? '<button class="cp-btn bad" data-act="cancel">Cancel</button>' : (b.status === 'pending' && apTab !== 'past' ? PEND_ACTS : '') })).join('')}</div>`).join('') : `<div class="cp-empty"><b>No ${apAll ? '' : 'confirmed '}appointments ${apTab === 'today' ? 'today' : apTab === 'upcoming' ? 'coming up' : 'in the past'}</b></div>`}</div>`;
    $('#ap-tabs').onclick = e => { const b = e.target.closest('button[data-t]'); if (b) { apTab = b.dataset.t; pgAppointments(main); } };
    $('#ap-all').onchange = e => { apAll = e.target.checked; pgAppointments(main); };
    wireActions($('#ap-list'), () => { pgAppointments(main); pollPending(true); });
  }

  /* ---------- Doctors ---------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayText = ds => { const k = ds.slice().sort().join(','); return k === '1,2,3,4,5,6' ? 'Mon-Sat' : k === '1,2,3,4,5' ? 'Mon-Fri' : k === '0,1,2,3,4,5,6' ? 'Every day' : ds.slice().sort().map(d => DAYS[d]).join(', '); };
  async function pgDoctors(main) {
    const c = await api('/api/admin/clinic');
    main.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h1 class="cp-h1">Doctors</h1><p class="cp-sub">${c.doctors.length} listed. Switch a doctor off to hide them from patients.</p></div><button class="cp-btn" id="dr-add">+ Add doctor</button></div>
      <div id="dr-list">${c.doctors.map(d => `<div class="cp-doc${d.active ? '' : ' off'}" data-id="${esc(d.id)}">
        <div class="cp-av">${esc(initials(d.name))}</div>
        <div><div class="nm">${esc(d.name)}</div><div class="mt">${esc(d.specialty)}${d.qualification ? ' &middot; ' + esc(d.qualification) : ''}<br>${d.experience_years} yrs &middot; &#8377;${d.fee} &middot; ${esc(dayText(d.days))} &middot; ${d.sessions.map(s => esc(fmtTime(s.start)) + '-' + esc(fmtTime(s.end))).join(', ')}</div></div>
        <div class="cp-doc-r" style="display:flex;gap:12px;align-items:center"><button class="cp-btn line" data-edit="${esc(d.id)}">Edit</button><button class="cp-sw${d.active ? ' on' : ''}" data-sw="${esc(d.id)}" aria-label="${d.active ? 'Disable' : 'Enable'} ${esc(d.name)}" title="${d.active ? 'Visible to patients' : 'Hidden from patients'}"></button></div></div>`).join('')}</div>`;
    const byId = {}; c.doctors.forEach(d => byId[d.id] = d);
    $('#dr-add').onclick = () => docForm(null, main);
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => docForm(byId[b.dataset.edit], main));
    main.querySelectorAll('[data-sw]').forEach(b => b.onclick = async () => {
      const on = !b.classList.contains('on'); b.disabled = true;
      try { const r = await api('/api/admin/doctors', { body: { action: 'set_active', id: b.dataset.sw, active: on } });
        toast((on ? 'Doctor is visible to patients' : 'Doctor hidden from patients') + (!on && r.upcoming_bookings ? '. ' + r.upcoming_bookings + ' upcoming booking(s) are kept.' : ''));
        pgDoctors(main); } catch (e) { toast(e.message, true); b.disabled = false; }
    });
  }
  function docForm(d, main) {
    const v = d || { name: '', specialty: '', qualification: '', experience_years: 5, fee: 500, days: [1, 2, 3, 4, 5, 6], sessions: [{ start: '09:00', end: '13:00' }, { start: '17:00', end: '20:00' }] };
    const days = new Set(v.days); const sess = v.sessions.map(s => ({ start: s.start, end: s.end }));
    const draw = () => modal(`<h3>${d ? 'Edit doctor' : 'Add doctor'}</h3>
      <div class="cp-f"><label>Name</label><input class="cp-in" id="df-name" value="${esc(v.name)}" maxlength="80" placeholder="Dr. Full Name"></div>
      <div class="cp-g2"><div class="cp-f"><label>Specialty</label><input class="cp-in" id="df-spec" value="${esc(v.specialty)}" maxlength="60" placeholder="e.g. General Physician"></div>
      <div class="cp-f"><label>Qualification</label><input class="cp-in" id="df-qual" value="${esc(v.qualification || '')}" maxlength="100" placeholder="MBBS, MD"></div></div>
      <div class="cp-g2"><div class="cp-f"><label>Experience (years)</label><input class="cp-in" id="df-exp" inputmode="numeric" value="${esc(v.experience_years)}" maxlength="2"></div>
      <div class="cp-f"><label>Consultation fee (&#8377;)</label><input class="cp-in" id="df-fee" inputmode="numeric" value="${esc(v.fee)}" maxlength="5"></div></div>
      <div class="cp-f"><label>Working days</label><div class="cp-days" id="df-days">${DAYS.map((n, i) => `<button type="button" data-d="${i}" class="${days.has(i) ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="cp-f"><label>Sessions (30-minute slots are made from these)</label><div id="df-sess">${sess.map((s, i) => `<div class="cp-sess"><input type="time" class="cp-in" data-s="${i}" data-k="start" value="${esc(s.start)}"><span>to</span><input type="time" class="cp-in" data-s="${i}" data-k="end" value="${esc(s.end)}"><button type="button" class="cp-btn line" data-rm="${i}" ${sess.length < 2 ? 'disabled' : ''}>&times;</button></div>`).join('')}</div>
        ${sess.length < 3 ? '<button type="button" class="cp-btn line" id="df-addsess">+ Add session</button>' : ''}</div>
      <div class="cp-err" id="df-err"></div>
      <div class="cp-acts" style="margin-top:8px"><button class="cp-btn line" id="df-cancel">Cancel</button><button class="cp-btn" id="df-save">${d ? 'Save changes' : 'Add doctor'}</button></div>`);
    const keep = () => { v.name = $('#df-name').value; v.specialty = $('#df-spec').value; v.qualification = $('#df-qual').value; v.experience_years = $('#df-exp').value; v.fee = $('#df-fee').value; };
    draw(); wire();
    function wire() {
      $('#df-cancel').onclick = closeModal;
      $('#df-days').onclick = e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.d; days.has(i) ? days.delete(i) : days.add(i); b.classList.toggle('on'); };
      document.querySelectorAll('#df-sess input').forEach(i => i.onchange = () => { sess[+i.dataset.s][i.dataset.k] = i.value; });
      document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { keep(); sess.splice(+b.dataset.rm, 1); draw(); wire(); });
      const a = $('#df-addsess'); if (a) a.onclick = () => { keep(); sess.push({ start: '18:00', end: '20:00' }); draw(); wire(); };
      $('#df-save').onclick = () => busy($('#df-save'), 'Saving...', async () => {
        const err = $('#df-err'); err.style.display = 'none';
        try {
          await api('/api/admin/doctors', { body: { action: 'save', id: d ? d.id : undefined, name: $('#df-name').value, specialty: $('#df-spec').value, qualification: $('#df-qual').value,
            experience_years: $('#df-exp').value, fee: $('#df-fee').value, days: [...days], sessions: sess } });
          closeModal(); toast(d ? 'Doctor updated' : 'Doctor added'); pgDoctors(main);
        } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
      });
    }
  }

  /* ---------- Slots ---------- */
  let slDoc = null, slDate = null;
  async function pgSlots(main) {
    const c = await api('/api/admin/clinic');
    const docs = c.doctors;
    if (!docs.length) { main.innerHTML = '<div class="cp-empty"><b>No doctors yet</b>Add a doctor first, then manage their slots here.</div>'; return; }
    if (!slDoc || !docs.some(d => d.id === slDoc)) slDoc = docs[0].id;
    main.innerHTML = `<h1 class="cp-h1">Slots</h1><p class="cp-sub">Tap a slot to disable, enable or delete it. Booked slots show the patient. Add extra times for any day in the next 14 days.</p>
      ${docs.length > 1 ? `<div class="cp-f"><select class="cp-sel" id="sl-doc">${docs.map(d => `<option value="${esc(d.id)}" ${d.id === slDoc ? 'selected' : ''}>${esc(d.name)} - ${esc(d.specialty)}${d.active ? '' : ' (hidden)'}</option>`).join('')}</select></div>` : `<p class="cp-sub" style="margin-top:-8px"><b>${esc(docs[0].name)}</b> &middot; ${esc(docs[0].specialty)}</p>`}
      <div id="sl-body"><div class="cp-loading">Loading slots...</div></div>`;
    const sel = $('#sl-doc'); if (sel) sel.onchange = () => { slDoc = sel.value; loadSlots(); };
    loadSlots();
    async function loadSlots() {
      const s = await api('/api/admin/slots?doctor_id=' + encodeURIComponent(slDoc)); ctx.today = s.today;
      if (!slDate || !s.days.some(d => d.date === slDate)) slDate = (s.days.find(d => d.works) || s.days[0]).date;
      const day = s.days.find(d => d.date === slDate);
      const nOpen = day.slots.filter(x => x.state === 'open' && !x.past).length, nBooked = day.slots.filter(x => x.state === 'booked').length;
      $('#sl-body').innerHTML = `<div class="cp-dpills" id="sl-dp">${s.days.map((d, i) => { const dd = D(d.date); const bk = d.slots.filter(x => x.state === 'booked').length; return `<button class="cp-dp${d.date === slDate ? ' on' : ''}${d.works || d.slots.length ? '' : ' off'}" data-d="${d.date}">${i === 0 ? 'Today' : dd.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}<b>${dd.getUTCDate()}</b>${dd.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}${bk ? `<br><span style="color:#1a4a9a">${bk} booked</span>` : ''}</button>`; }).join('')}</div>
        <div class="cp-card"><h3>${esc(dayLabel(slDate, s.today))} &middot; ${nOpen} open, ${nBooked} booked</h3>
        <div class="cp-legend"><span><i></i>Open</span><span><i style="background:#eaf1fd;border-color:#9db9ea"></i>Booked</span><span><i style="background:#f1f3f6;border-style:dashed"></i>Disabled</span><span><i style="border-color:#2aa89a"></i>Added by you</span></div>
        ${day.slots.length ? `<div class="cp-slots" id="sl-grid">${day.slots.map(x => `<button class="cp-slot ${x.state}${x.extra ? ' extra' : ''}${x.past ? ' past' : ''}" data-t="${esc(x.time)}" data-st="${x.state}" data-ref="${esc(x.ref || '')}" data-pt="${esc(x.patient || '')}">${esc(fmtTime(x.time))}<small>${x.state === 'booked' ? esc(x.patient) : x.state === 'blocked' ? 'Disabled' : x.extra ? 'Added' : 'Open'}</small></button>`).join('')}</div>` : '<div class="cp-empty"><b>Not working this day</b>Add a slot below if you want to open this day.</div>'}
        <div style="display:flex;gap:10px;align-items:center;margin-top:16px;flex-wrap:wrap"><select class="cp-sel" id="sl-new" style="max-width:170px">${timeOptions()}</select><button class="cp-btn" id="sl-add">+ Add slot</button></div></div>`;
      $('#sl-dp').onclick = e => { const b = e.target.closest('button[data-d]'); if (b) { slDate = b.dataset.d; loadSlots(); } };
      const grid = $('#sl-grid');
      if (grid) grid.onclick = e => {
        const b = e.target.closest('.cp-slot'); if (!b) return;
        const st = b.dataset.st, t = b.dataset.t, isExtra = b.classList.contains('extra');
        const act = async (action, msg) => { try { await api('/api/admin/slots', { body: { doctor_id: slDoc, date: slDate, slot: t, action } }); closeModal(); toast(msg); loadSlots(); } catch (er) { toast(er.message, true); } };
        const head = `<h3>${esc(fmtTime(t))} &middot; ${esc(dayLabel(slDate, s.today))}</h3>`;
        if (st === 'booked') { modal(head + `<p class="cp-sub" style="margin-bottom:14px"><b>Booked</b> by ${esc(b.dataset.pt)} (${esc(b.dataset.ref)}). To free this slot, cancel the booking from Appointments first.</p><div class="cp-acts"><button class="cp-btn line" id="sm-x">Close</button><a class="cp-btn" href="/clinic-admin/appointments" data-r="appointments" style="text-decoration:none">Open appointments</a></div>`); }
        else if (st === 'blocked') { modal(head + `<p class="cp-sub" style="margin-bottom:14px">This slot is disabled, so patients cannot book it.</p><div class="cp-acts"><button class="cp-btn line" id="sm-x">Close</button><button class="cp-btn ok" id="sm-en">Enable slot</button></div>`); $('#sm-en').onclick = () => act('unblock', 'Slot enabled'); }
        else if (isExtra) { modal(head + `<p class="cp-sub" style="margin-bottom:14px">This is a slot you added. Delete it to remove it completely.</p><div class="cp-acts"><button class="cp-btn line" id="sm-x">Close</button><button class="cp-btn badf" id="sm-del">Delete slot</button></div>`); $('#sm-del').onclick = () => act('block', 'Slot deleted'); }
        else { modal(head + `<p class="cp-sub" style="margin-bottom:14px">Open for patients. Disable it for this day only (you can enable it again). The regular weekly hours are changed under Doctors.</p><div class="cp-acts"><button class="cp-btn line" id="sm-x">Close</button><button class="cp-btn bad" id="sm-dis">Disable slot</button></div>`); $('#sm-dis').onclick = () => act('block', 'Slot disabled'); }
        $('#sm-x').onclick = closeModal;
      };
      $('#sl-add').onclick = () => busy($('#sl-add'), 'Adding...', async () => {
        try { await api('/api/admin/slots', { body: { doctor_id: slDoc, date: slDate, slot: $('#sl-new').value, action: 'add' } }); toast('Slot added'); await loadSlots(); }
        catch (er) { toast(er.message, true); }
      });
    }
  }
  function timeOptions() { let o = ''; for (let h = 6; h < 23; h++) for (const m of [0, 15, 30, 45]) { const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); o += `<option value="${t}"${t === '12:00' ? ' selected' : ''}>${fmtTime(t)}</option>`; } return o; }

  /* ---------- Settings ---------- */
  async function pgSettings(main) {
    const { clinic: c } = await api('/api/admin/clinic');
    let specs = (c.specialties || []).slice(), logoData = null, logoRemove = false;
    main.innerHTML = `<h1 class="cp-h1">Clinic settings</h1><p class="cp-sub">This is what patients see on your clinic page.</p>
      <div class="cp-card"><div class="cp-f"><label>Logo</label><div class="cp-logo-box"><div class="cp-logo-prev" id="st-prev">${c.has_logo ? `<img src="/api/clinic-logo?id=${encodeURIComponent(c.id)}&t=${Date.now()}" alt="">` : 'No logo'}</div>
        <div><input type="file" id="st-file" accept="image/png,image/jpeg,image/webp" class="hidden"><button class="cp-btn line" id="st-pick" type="button">Upload logo</button> <button class="cp-btn bad ${c.has_logo ? '' : 'hidden'}" id="st-rm" type="button">Remove</button><small style="display:block;color:var(--ca-mut);margin-top:6px;font-size:12px">PNG, JPEG or WebP. Resized to 256 px automatically.</small></div></div></div>
      <div class="cp-f"><label for="st-name">Clinic name</label><input class="cp-in" id="st-name" maxlength="80" value="${esc(c.name)}">${/^SAMPLE\b/i.test(c.name) ? '<small>This is a sample clinic, so the SAMPLE tag stays in the name.</small>' : ''}</div>
      <div class="cp-f"><label for="st-addr">Address</label><textarea class="cp-ta" id="st-addr" maxlength="200">${esc(c.address)}</textarea></div>
      <div class="cp-g2"><div class="cp-f"><label for="st-phone">Phone</label><input class="cp-in" id="st-phone" inputmode="tel" maxlength="20" value="${esc(c.phone)}"></div>
      <div class="cp-f"><label for="st-time">Timings</label><input class="cp-in" id="st-time" maxlength="100" value="${esc(c.timings)}"></div></div>
      <div class="cp-f"><label for="st-tag">Tagline (optional)</label><input class="cp-in" id="st-tag" maxlength="120" value="${esc(c.tagline || '')}"></div>
      <div class="cp-f"><label>Specialties</label><div class="cp-days" id="st-specs" style="gap:8px"></div><div style="display:flex;gap:8px;margin-top:10px"><input class="cp-in" id="st-newspec" maxlength="40" placeholder="Add a specialty" style="flex:1"><button class="cp-btn line" id="st-addspec" type="button">Add</button></div></div>
      <div class="cp-err" id="st-err"></div>
      <button class="cp-btn" id="st-save" style="padding:13px 22px">Save changes</button></div>`;
    const drawSpecs = () => { $('#st-specs').innerHTML = specs.map((s, i) => `<button type="button" class="on" style="width:auto;padding:0 12px" data-i="${i}" title="Remove">${esc(s)} &times;</button>`).join('') || '<small>No specialties yet</small>'; };
    drawSpecs();
    $('#st-specs').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { specs.splice(+b.dataset.i, 1); drawSpecs(); } };
    const addSpec = () => { const v = $('#st-newspec').value.trim(); if (v && specs.length < 8 && !specs.includes(v)) { specs.push(v); drawSpecs(); } $('#st-newspec').value = ''; };
    $('#st-addspec').onclick = addSpec; $('#st-newspec').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addSpec(); } };
    $('#st-pick').onclick = () => $('#st-file').click();
    $('#st-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); const fr = new FileReader(); fr.onerror = () => rej(new Error('Could not read that image')); fr.onload = () => { i.src = fr.result; }; fr.readAsDataURL(f); });
        const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
        const s = Math.min(img.width, img.height); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
        logoData = cv.toDataURL('image/jpeg', 0.88); logoRemove = false;
        $('#st-prev').innerHTML = `<img src="${logoData}" alt="">`; $('#st-rm').classList.remove('hidden');
      } catch (er) { toast(er.message, true); }
    };
    $('#st-rm').onclick = () => { logoData = null; logoRemove = true; $('#st-prev').textContent = 'No logo'; $('#st-rm').classList.add('hidden'); };
    $('#st-save').onclick = () => busy($('#st-save'), 'Saving...', async () => {
      const err = $('#st-err'); err.style.display = 'none';
      try {
        const r = await api('/api/admin/clinic', { method: 'PUT', body: { name: $('#st-name').value, address: $('#st-addr').value, phone: $('#st-phone').value, timings: $('#st-time').value, tagline: $('#st-tag').value, specialties: specs } });
        if (logoData) await api('/api/clinic-logo', { body: { data: logoData } });
        else if (logoRemove) await api('/api/clinic-logo', { method: 'DELETE' });
        toast('Settings saved'); loadHeader(); pgSettings(main);
      } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
    });
  }

  /* ---------- header ---------- */
  async function loadHeader() {
    try {
      const c = await api('/api/admin/clinic');
      $('#cp-cname').textContent = c.clinic.name;
      $('#cp-role').textContent = IS_DOC ? 'Doctor login - your own schedule' : 'Clinic account';
      const lg = $('#cp-clogo');
      if (c.clinic.has_logo) { lg.src = '/api/clinic-logo?id=' + encodeURIComponent(c.clinic.id) + '&t=' + Date.now(); lg.classList.remove('hidden'); } else lg.classList.add('hidden');
    } catch (e) { /* handled by api() on 401 */ }
  }
  loadHeader();
  pollPending(true);
  go();
})();
