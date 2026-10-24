'use strict';
(function () {
  const { api, esc, $, notice, money, fmtDate, showFieldErrors, clearFieldErrors } = window.VR;
  let cfg, creds;

  function render(b) {
    $('#booking-view').innerHTML = `<div class="panel mt"><h2>${esc(b.ref)} <span class="pill ${esc(b.status)}">${esc(b.status)}</span></h2>
      <ul class="lines"><li><span>Car</span><b>${esc(b.car)}</b></li><li><span>Dates</span><b>${fmtDate(b.start)} to ${fmtDate(b.end)} (${b.days} days)</b></li>
      <li><span>Pick-up</span><b>${esc(b.pickupLocation)}</b></li><li><span>Drop-off</span><b>${esc(b.dropoffLocation)}</b></li>
      <li><span>Driver</span><b>${b.chauffeur ? `GearPilot driver: ${esc(b.chauffeur)}` : 'Self-drive'}</b></li><li><span>Total</span><b>${money(cfg, b.total)}</b></li></ul>
      ${b.status === 'confirmed' ? '<button class="btn danger small" id="cancel-btn" type="button">Cancel this booking</button>' : ''}<div id="cancel-msg"></div></div>`;
    const btn = $('#cancel-btn');
    if (btn) btn.addEventListener('click', async () => {
      if (!confirm('Cancel this booking? This cannot be undone.')) return;
      try { render(await api('/bookings/cancel', { method: 'POST', body: creds })); notice($('#cancel-msg'), 'ok', 'Your booking has been cancelled.'); }
      catch (err) { notice($('#cancel-msg'), 'error', err.message); }
    });
  }

  document.addEventListener('vr:ready', async () => {
    cfg = await window.VR.getConfig();
    $('#call-link').href = `tel:${cfg.business.phone.replace(/[^+\d]/g, '')}`; $('#call-link').textContent = `Call ${cfg.business.phone}`;
    $('#lookup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; clearFieldErrors(f); $('#booking-view').innerHTML = '';
      creds = { ref: f.ref.value.trim(), email: f.email.value.trim() };
      try { notice($('#lookup-msg'), 'info', ''); render(await api(`/bookings/lookup?ref=${encodeURIComponent(creds.ref)}&email=${encodeURIComponent(creds.email)}`)); }
      catch (err) { notice($('#lookup-msg'), 'error', err.message); showFieldErrors(f, err.details); }
    });
  });
})();
