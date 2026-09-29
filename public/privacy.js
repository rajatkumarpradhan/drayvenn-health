const $ = s => document.querySelector(s);
$('#del-phone').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); });
$('#del-btn').onclick = async () => {
  const err = $('#del-error');
  err.style.display = 'none';
  const phone = $('#del-phone').value.trim();
  const ref = $('#del-ref').value.trim();
  if (!/^[6-9]\d{9}$/.test(phone) || !ref) {
    err.textContent = 'Enter your booking reference and a valid 10-digit mobile number.';
    err.style.display = 'block';
    return;
  }
  const btn = $('#del-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/privacy/delete-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, ref, note: $('#del-note').value.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    $('#del-done').textContent = data.message;
    $('#del-done').classList.remove('hidden');
    btn.classList.add('hidden');
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
    btn.disabled = false;
  }
};
