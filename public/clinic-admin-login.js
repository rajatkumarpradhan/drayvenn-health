(function () {
  const $ = s => document.querySelector(s);
  const VIEWS = ['v-login', 'v-forgot', 'v-reset', 'v-join'];
  const show = id => { VIEWS.forEach(v => $('#' + v).classList.toggle('hidden', v !== id)); window.scrollTo(0, 0); };
  const err = (sel, msg) => { const e = $(sel); e.textContent = msg || ''; e.style.display = msg ? 'block' : 'none'; };
  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  const q = new URLSearchParams(location.search);
  const resetToken = q.get('reset');
  if (q.get('expired')) $('#ca-expired').classList.remove('hidden');

  /* already signed in on this browser tab: go straight to the dashboard */
  if (sessionStorage.getItem('dh_admin_token') && !q.get('expired') && !resetToken) { location.replace(sessionStorage.getItem('dh_admin_role') === 'platform' ? '/clinic-admin/platform' : '/clinic-admin/dashboard'); return; }

  $('#ca-toggle').onclick = () => {
    const p = $('#ca-pass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#ca-toggle').textContent = show ? 'Hide' : 'Show';
    $('#ca-toggle').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };

  $('#f-login').onsubmit = async e => {
    e.preventDefault(); err('#ca-error');
    const email = $('#ca-email').value.trim(), password = $('#ca-pass').value;
    if (!email || !password) return err('#ca-error', 'Enter your email and password.');
    const btn = $('#ca-submit'); btn.disabled = true; btn.textContent = 'Signing in...';
    try {
      const d = await post('/api/admin/login', { email, password });
      sessionStorage.setItem('dh_admin_token', d.token);
      sessionStorage.setItem('dh_admin_role', d.role || 'clinic');
      sessionStorage.setItem('dh_admin_doctor', d.doctor_name || '');
      sessionStorage.setItem('dh_admin_clinic', d.clinic.name);
      btn.textContent = 'Opening dashboard...';
      location.href = d.role === 'platform' ? '/clinic-admin/platform' : '/clinic-admin/dashboard';
    } catch (ex) { err('#ca-error', ex.message); btn.disabled = false; btn.textContent = 'Sign in'; }
  };

  $('#l-forgot').onclick = e => { e.preventDefault(); const em = $('#ca-email').value.trim(); if (em) $('#fg-email').value = em; $('#fg-ok').classList.add('hidden'); err('#fg-error'); show('v-forgot'); };
  $('#l-join').onclick = e => { e.preventDefault(); show('v-join'); };
  document.querySelectorAll('.l-back').forEach(a => a.onclick = e => { e.preventDefault(); history.replaceState(null, '', location.pathname); show('v-login'); });

  $('#f-forgot').onsubmit = async e => {
    e.preventDefault(); err('#fg-error'); $('#fg-ok').classList.add('hidden');
    const btn = $('#fg-btn'); btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const d = await post('/api/admin/forgot', { email: $('#fg-email').value });
      const ok = $('#fg-ok'); ok.textContent = d.message;
      if (d.demo_link) {
        ok.appendChild(document.createElement('br')); ok.appendChild(document.createElement('br'));
        const b = document.createElement('b'); b.textContent = 'Demo mode'; ok.appendChild(b);
        ok.appendChild(document.createTextNode(' - email is not connected yet, so the link is shown here for sample clinics only: '));
        const a = document.createElement('a'); a.href = d.demo_link; a.textContent = 'Open reset link'; ok.appendChild(a);
      }
      ok.classList.remove('hidden');
    } catch (ex) { err('#fg-error', ex.message); }
    finally { btn.disabled = false; btn.textContent = 'Send reset link'; }
  };

  $('#f-reset').onsubmit = async e => {
    e.preventDefault(); err('#rs-error');
    const p1 = $('#rs-pass').value, p2 = $('#rs-pass2').value;
    if (p1.length < 10) return err('#rs-error', 'Password must be at least 10 characters.');
    if (p1 !== p2) return err('#rs-error', 'The two passwords do not match.');
    const btn = $('#rs-btn'); btn.disabled = true; btn.textContent = 'Saving...';
    try {
      await post('/api/admin/reset', { token: resetToken, password: p1 });
      history.replaceState(null, '', location.pathname);
      show('v-login');
      const n = $('#ca-expired'); n.textContent = 'Password updated. Sign in with your new password.'; n.classList.remove('hidden');
    } catch (ex) { err('#rs-error', ex.message); }
    finally { btn.disabled = false; btn.textContent = 'Save new password'; }
  };

  $('#f-join').onsubmit = async e => {
    e.preventDefault(); err('#jn-error');
    const btn = $('#jn-btn'); btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await post('/api/clinic-request', {
        clinic_name: $('#jn-clinic').value, contact_name: $('#jn-contact').value, email: $('#jn-email').value,
        phone: $('#jn-phone').value, area: $('#jn-area').value, specialties: $('#jn-specs').value, message: '', website: $('#jn-web').value
      });
      const ok = $('#jn-ok'); ok.textContent = 'Request received. The Drayvenn Lab team will contact you on the phone or email you gave to set up your clinic.';
      ok.classList.remove('hidden'); btn.style.display = 'none';
    } catch (ex) { err('#jn-error', ex.message); btn.disabled = false; btn.textContent = 'Send request'; }
  };

  if (resetToken) show('v-reset');
  else if (location.hash === '#join') show('v-join');
})();
