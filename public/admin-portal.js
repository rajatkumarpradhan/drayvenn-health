/* Clinic portal extras: forgot/reset password, join-as-clinic request, clinic + doctor editor,
   doctor-level role. Loads after admin.js (uses its $, esc, api, auth, toast, fmtTime). */
(function () {
  const VIEWS = ['admin-platform-view', 'admin-login-view', 'admin-forgot-view', 'admin-reset-view', 'admin-join-view', 'admin-dash-view'];
  function showView(id) { VIEWS.forEach(v => { const el = document.getElementById(v); if (el) el.classList.toggle('hidden', v !== id); }); window.scrollTo(0, 0); }
  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  function err(id, msg) { const e = $(id); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; }

  document.querySelectorAll('.adm-back').forEach(a => a.onclick = e => { e.preventDefault(); history.replaceState(null, '', location.pathname); showView('admin-login-view'); });
  $('#adm-forgot-link').onclick = e => { e.preventDefault(); const em = $('#adm-email').value.trim(); if (em) $('#fg-email').value = em; $('#fg-ok').classList.add('hidden'); err('#fg-error'); showView('admin-forgot-view'); };
  $('#adm-join-link').onclick = e => { e.preventDefault(); showView('admin-join-view'); };

  /* forgot */
  $('#fg-btn').onclick = async () => {
    const btn = $('#fg-btn'); err('#fg-error'); $('#fg-ok').classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const d = await post('/api/admin/forgot', { email: $('#fg-email').value });
      const ok = $('#fg-ok');
      ok.innerHTML = esc(d.message) + (d.demo_link ? `<br><br><b>Demo mode</b> - email is not connected yet, so the link is shown here for sample clinics only:<br><a href="${esc(d.demo_link)}">Open reset link</a>` : '');
      ok.classList.remove('hidden');
    } catch (e) { err('#fg-error', e.message); }
    finally { btn.disabled = false; btn.textContent = 'Send reset link'; }
  };

  /* reset (link carries ?reset=token) */
  const resetToken = new URLSearchParams(location.search).get('reset');
  $('#rs-btn').onclick = async () => {
    const p1 = $('#rs-pass').value, p2 = $('#rs-pass2').value; err('#rs-error');
    if (p1.length < 10) return err('#rs-error', 'Password must be at least 10 characters');
    if (p1 !== p2) return err('#rs-error', 'The two passwords do not match');
    const btn = $('#rs-btn'); btn.disabled = true; btn.textContent = 'Saving...';
    try {
      await post('/api/admin/reset', { token: resetToken, password: p1 });
      history.replaceState(null, '', location.pathname);
      showView('admin-login-view'); toast('Password updated. Sign in with your new password.', 'success');
    } catch (e) { err('#rs-error', e.message); }
    finally { btn.disabled = false; btn.textContent = 'Save new password'; }
  };

  /* join as a clinic */
  $('#jn-btn').onclick = async () => {
    err('#jn-error');
    const btn = $('#jn-btn'); btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await post('/api/clinic-request', {
        clinic_name: $('#jn-clinic').value, contact_name: $('#jn-contact').value, email: $('#jn-email').value,
        phone: $('#jn-phone').value, area: $('#jn-area').value, specialties: $('#jn-specs').value, message: $('#jn-msg').value, website: $('#jn-web').value
      });
      $('#join-form').classList.add('hidden');
      const ok = $('#jn-ok'); ok.innerHTML = '<b>Request received.</b><br>Thank you. The Drayvenn Lab team will contact you on the phone or email you gave to set up your clinic.<br><br><a href="index.html">Back to Drayvenn Lab</a>'; ok.classList.remove('hidden');
    } catch (e) { err('#jn-error', e.message); }
    finally { btn.disabled = false; btn.textContent = 'Send request'; }
  };

  /* tabs + clinic editor */
  const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let portalData = null;
  function setTab(name) {
    document.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $('#tab-bookings').classList.toggle('hidden', name !== 'bookings');
    $('#tab-clinic').classList.toggle('hidden', name !== 'clinic');
    if (name === 'clinic') loadClinic();
  }
  document.querySelectorAll('.adm-tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  window.portalInit = function (role) { $('#adm-tabs').classList.toggle('hidden', role === 'doctor'); setTab('bookings'); };
  window.portalReset = function () { $('#adm-tabs').classList.add('hidden'); $('#tab-clinic').innerHTML = ''; };

  async function loadClinic() {
    const host = $('#tab-clinic');
    host.innerHTML = '<div class="loading">Loading...</div>';
    try { portalData = await api('/api/admin/clinic'); renderClinic(); }
    catch (e) { host.innerHTML = `<div class="form-error" style="display:block">${esc(e.message)}</div>`; }
  }
  function renderClinic() {
    const c = portalData.clinic, host = $('#tab-clinic');
    host.innerHTML = `
      <div class="adm-card"><h3>Clinic details</h3>
        <div class="form-grid">
          <div class="form-row"><label>Address</label><input id="ce-address" maxlength="200" value="${esc(c.address)}"></div>
          <div class="form-row"><label>Clinic phone</label><input id="ce-phone" type="tel" maxlength="20" value="${esc(c.phone)}"></div>
          <div class="form-row"><label>Tagline</label><input id="ce-tagline" maxlength="120" value="${esc(c.tagline || '')}"></div>
          <div class="form-row"><label>Timings</label><input id="ce-timings" maxlength="100" value="${esc(c.timings)}" placeholder="Mon-Sat 9 AM - 8 PM"></div>
          <div class="form-error" id="ce-error"></div>
          <button class="btn" id="ce-save">Save clinic details</button>
        </div>
      </div>
      <div class="adm-card"><div class="adm-card-head"><h3>Doctors</h3><button class="btn btn-small" id="doc-add">+ Add doctor</button></div>
        <div id="doc-list">${portalData.doctors.map(docRow).join('')}</div>
        <div id="doc-form-host"></div>
      </div>`;
    $('#ce-save').onclick = saveClinic;
    $('#doc-add').onclick = () => openDocForm(null);
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openDocForm(portalData.doctors.find(d => d.id === b.dataset.edit)));
    host.querySelectorAll('[data-login]').forEach(b => b.onclick = () => openLoginForm(portalData.doctors.find(d => d.id === b.dataset.login)));
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delDoctor(b));
  }
  function docRow(d) {
    return `<div class="doc-row">
      <div><div class="doc-name">${esc(d.name)}</div>
      <div class="doc-meta">${esc(d.specialty)} · \u20B9${d.fee} · ${d.days.map(x => DAYN[x]).join(', ')}</div>
      <div class="doc-meta">${d.sessions.map(s => fmtTime(s.start) + '-' + fmtTime(s.end)).join(' · ')}</div>
      <div class="doc-meta">${d.login_email ? 'Login: ' + esc(d.login_email) : 'No doctor login yet'}</div></div>
      <div class="doc-actions"><button class="btn btn-ghost btn-small" data-edit="${esc(d.id)}">Edit</button><button class="btn btn-ghost btn-small" data-login="${esc(d.id)}">${d.login_email ? 'Reset login' : 'Create login'}</button><button class="btn btn-ghost btn-small doc-del" data-del="${esc(d.id)}">Remove</button></div>
    </div>`;
  }
  async function saveClinic() {
    err('#ce-error'); const btn = $('#ce-save'); btn.disabled = true;
    try {
      const r = await fetch('/api/admin/clinic', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
        body: JSON.stringify({ address: $('#ce-address').value, phone: $('#ce-phone').value, tagline: $('#ce-tagline').value, timings: $('#ce-timings').value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save');
      toast('Clinic details saved', 'success');
    } catch (e) { err('#ce-error', e.message); }
    finally { btn.disabled = false; }
  }
  function openDocForm(d) {
    const hostEl = $('#doc-form-host'); const x = d || { name: '', specialty: '', qualification: '', experience_years: 5, fee: 300, days: [1, 2, 3, 4, 5, 6], sessions: [{ start: '10:00', end: '13:00' }] };
    const sess = x.sessions.slice(); while (sess.length < 2) sess.push({ start: '', end: '' });
    hostEl.innerHTML = `<div class="doc-form"><h4>${d ? 'Edit doctor' : 'Add doctor'}</h4><div class="form-grid">
      <div class="form-row"><label>Name</label><input id="df-name" maxlength="80" value="${esc(x.name)}" placeholder="Dr. Full Name"></div>
      <div class="form-row"><label>Specialty</label><input id="df-spec" maxlength="60" value="${esc(x.specialty)}"></div>
      <div class="form-row"><label>Qualification</label><input id="df-qual" maxlength="100" value="${esc(x.qualification)}"></div>
      <div class="form-row two"><div><label>Experience (years)</label><input id="df-exp" type="number" min="0" max="70" value="${x.experience_years}"></div><div><label>Fee (\u20B9)</label><input id="df-fee" type="number" min="0" max="20000" value="${x.fee}"></div></div>
      <div class="form-row"><label>Working days</label><div class="day-pick">${DAYN.map((n, i) => `<label class="day-chip"><input type="checkbox" value="${i}" ${x.days.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
      <div class="form-row"><label>Session 1</label><div class="sess-row"><input type="time" id="df-s1a" value="${esc(sess[0].start)}"><span>to</span><input type="time" id="df-s1b" value="${esc(sess[0].end)}"></div></div>
      <div class="form-row"><label>Session 2 (optional)</label><div class="sess-row"><input type="time" id="df-s2a" value="${esc(sess[1].start)}"><span>to</span><input type="time" id="df-s2b" value="${esc(sess[1].end)}"></div></div>
      <div class="form-error" id="df-error"></div>
      <div class="doc-form-btns"><button class="btn" id="df-save">${d ? 'Save changes' : 'Add doctor'}</button><button class="btn btn-ghost" id="df-cancel">Cancel</button></div>
    </div></div>`;
    $('#df-cancel').onclick = () => { hostEl.innerHTML = ''; };
    $('#df-save').onclick = async () => {
      err('#df-error');
      const sessions = [];
      [['s1a', 's1b'], ['s2a', 's2b']].forEach(([a, b]) => { const s = $('#df-' + a).value, e = $('#df-' + b).value; if (s || e) sessions.push({ start: s, end: e }); });
      const days = [...hostEl.querySelectorAll('.day-pick input:checked')].map(i => Number(i.value));
      const btn = $('#df-save'); btn.disabled = true;
      try {
        await api('/api/admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', id: d && d.id, name: $('#df-name').value, specialty: $('#df-spec').value, qualification: $('#df-qual').value, experience_years: $('#df-exp').value, fee: $('#df-fee').value, days, sessions }) });
        toast(d ? 'Doctor updated' : 'Doctor added', 'success'); loadClinic();
      } catch (e) { err('#df-error', e.message); btn.disabled = false; }
    };
    hostEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function openLoginForm(d) {
    const hostEl = $('#doc-form-host');
    hostEl.innerHTML = `<div class="doc-form"><h4>Doctor login for ${esc(d.name)}</h4><p class="doc-meta">The doctor signs in at this same page and sees only their own bookings.</p><div class="form-grid">
      <div class="form-row"><label>Login email</label><input id="dl-email" type="email" maxlength="120" value="${esc(d.login_email || '')}" autocomplete="off"></div>
      <div class="form-row"><label>Password (min 10 characters)</label><input id="dl-pass" type="text" maxlength="100" autocomplete="off"></div>
      <div class="form-error" id="dl-error"></div>
      <div class="doc-form-btns"><button class="btn" id="dl-save">Save login</button>${d.login_email ? '<button class="btn btn-ghost" id="dl-remove">Remove login</button>' : ''}<button class="btn btn-ghost" id="dl-cancel">Cancel</button></div>
    </div></div>`;
    $('#dl-cancel').onclick = () => { hostEl.innerHTML = ''; };
    const send = async body => { await api('/api/admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); loadClinic(); };
    $('#dl-save').onclick = async () => { err('#dl-error'); try { await send({ action: 'set_login', id: d.id, email: $('#dl-email').value, password: $('#dl-pass').value }); toast('Doctor login saved', 'success'); } catch (e) { err('#dl-error', e.message); } };
    const rm = $('#dl-remove'); if (rm) rm.onclick = async () => { try { await send({ action: 'remove_login', id: d.id }); toast('Doctor login removed', 'info'); } catch (e) { err('#dl-error', e.message); } };
    hostEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function delDoctor(btn) {
    if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tap again to remove'; setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Remove'; }, 3500); return; }
    try { await api('/api/admin/doctors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: btn.dataset.del }) }); toast('Doctor removed', 'info'); loadClinic(); }
    catch (e) { toast(e.message, 'error'); btn.dataset.armed = ''; btn.textContent = 'Remove'; }
  }

  /* Drayvenn Lab team: review clinic join requests */
  const ST = { new: 'New', approved: 'Approved', rejected: 'Rejected', test: 'Test' };
  async function pfApi(body) {
    return api('/api/platform/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async function pfLoad() {
    const host = $('#pf-list'); host.innerHTML = '<div class="loading">Loading...</div>';
    try {
      const d = await api('/api/platform/requests');
      host.innerHTML = d.requests.length ? d.requests.map(pfCard).join('') : '<div class="adm-card"><p class="doc-meta">No join requests yet.</p></div>';
      host.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => pfAct(b.dataset.pf, b.dataset.id, b));
    } catch (e) { host.innerHTML = `<div class="form-error" style="display:block">${esc(e.message)}</div>`; }
  }
  function pfCard(r) {
    const open = r.status === 'new';
    return `<div class="adm-card pf-card" id="pf-${r.id}"><div class="adm-card-head"><h3>${esc(r.clinic_name)}</h3><span class="pf-badge pf-${esc(r.status)}">${esc(ST[r.status] || r.status)}</span></div>
      <div class="doc-meta">${esc(r.area)}${r.specialties ? ' · ' + esc(r.specialties) : ''}</div>
      <div class="doc-meta">${esc(r.contact_name)} · <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a> · ${esc(r.email)}</div>
      ${r.message ? `<div class="doc-meta">"${esc(r.message)}"</div>` : ''}
      <div class="doc-meta">Received ${esc(r.created_at)} UTC${r.clinic_id ? ' · clinic id ' + esc(r.clinic_id) : ''}</div>
      ${open ? `<div class="pf-approve hidden" id="pf-ap-${r.id}"><div class="form-row"><label>Login email for the clinic</label><input id="pf-em-${r.id}" type="email" value="${esc(r.email)}"></div>
        <label class="pf-check"><input type="checkbox" id="pf-sm-${r.id}" checked> Mark as SAMPLE clinic (demo phase)</label><div class="form-error" id="pf-er-${r.id}"></div>
        <div class="doc-form-btns"><button class="btn btn-small" data-pf="confirm" data-id="${r.id}">Create clinic &amp; login</button><button class="btn btn-ghost btn-small" data-pf="cancel" data-id="${r.id}">Cancel</button></div></div>
      <div class="doc-actions" id="pf-btns-${r.id}"><button class="btn btn-small" data-pf="approve" data-id="${r.id}">Approve</button><button class="btn btn-ghost btn-small" data-pf="test" data-id="${r.id}">Mark as test</button><button class="btn btn-ghost btn-small doc-del" data-pf="reject" data-id="${r.id}">Reject</button></div>` : ''}
      <div id="pf-res-${r.id}"></div></div>`;
  }
  async function pfAct(action, id, btn) {
    if (action === 'approve') { $('#pf-ap-' + id).classList.remove('hidden'); $('#pf-btns-' + id).classList.add('hidden'); return; }
    if (action === 'cancel') { $('#pf-ap-' + id).classList.add('hidden'); $('#pf-btns-' + id).classList.remove('hidden'); return; }
    if (action === 'reject' || action === 'test') {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent; btn.textContent = 'Tap again to confirm'; setTimeout(() => { btn.dataset.armed = ''; btn.textContent = btn.dataset.orig; }, 3500); return; }
      try { await pfApi({ id, action }); toast(action === 'test' ? 'Marked as test' : 'Request rejected', 'info'); pfLoad(); } catch (e) { toast(e.message, 'error'); }
      return;
    }
    if (action === 'confirm') {
      btn.disabled = true; err('#pf-er-' + id);
      try {
        const d = await pfApi({ id, action: 'approve', login_email: $('#pf-em-' + id).value, sample: $('#pf-sm-' + id).checked });
        $('#pf-ap-' + id).classList.add('hidden');
        $('#pf-res-' + id).innerHTML = `<div class="adm-note"><b>Clinic created.</b> Share these once with the clinic (the password is not shown again):<br><br>Login page: <b>${esc(location.origin)}/admin</b><br>Email: <b>${esc(d.login_email)}</b><br>Password: <b>${esc(d.temp_password)}</b><br><br>The clinic should use "Forgot password?" to set its own password, then add its doctors in "Clinic &amp; doctors". The clinic appears on the site after its first doctor is added.</div>`;
        toast('Clinic created', 'success');
      } catch (e) { err('#pf-er-' + id, e.message); btn.disabled = false; }
    }
  }
  window.portalPlatformShow = function () { showView('admin-platform-view'); pfLoad(); };
  $('#pf-refresh').onclick = pfLoad;
  $('#pf-logout').onclick = () => { auth.token = null; sessionStorage.removeItem('dh_admin_token'); sessionStorage.removeItem('dh_admin_role'); sessionStorage.removeItem('dh_admin_clinic'); showView('admin-login-view'); };

  if (resetToken) showView('admin-reset-view');
  else if (location.hash === '#join') showView('admin-join-view');
})();
