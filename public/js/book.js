'use strict';
(function () {
  const { api, tint, icon, esc, $, $$, carSvg, carArt, hasPhoto, notice, todayStr, money, fmtDate, showFieldErrors, clearFieldErrors } = window.VR;
  const params = new URLSearchParams(location.search);
  let cfg, cars = [], quoteTimer;
  const form = () => $('#trip-form');

  function setStep(n) {
    [1, 2].forEach((i) => $(`#step${i}`).classList.toggle('hidden', i !== n));
    $('#step3').classList.toggle('hidden', n !== 3);
    $('#trip-form').classList.toggle('hidden', n === 3);
    $$('#stepper li').forEach((li) => { const s = +li.dataset.s; li.classList.toggle('active', s === n); li.classList.toggle('done', s < n); });
    $('#summary-box').classList.toggle('hidden', n === 3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const tripBody = () => {
    const f = form();
    return {
      carId: +f.carId.value, pickupLocationId: +f.pickupLocationId.value, dropoffLocationId: +f.dropoffLocationId.value,
      start: f.start.value, end: f.end.value, driverMode: f.driverMode.value, addons: $$('input[name=addon]:checked').map((a) => a.value),
      ...(f.dateOfBirth.value ? { dateOfBirth: f.dateOfBirth.value } : {}),
    };
  };

  async function refreshQuote() {
    const f = form();
    if (!f.start.value || !f.end.value || !f.carId.value) return;
    const car = cars.find((c) => c.id === +f.carId.value);
    if (car) { $('#sum-art').innerHTML = carArt(car); $('#sum-art').classList.toggle('photo', hasPhoto(car)); $('#sum-car').dataset.car = car.color; tint($('#sum-car')); $('#sum-title').textContent = `${car.make} ${car.model}`; }
    $('#trip-err').classList.add('hidden');
    try {
      const q = await api('/quote', { method: 'POST', body: tripBody() });
      $('#sum-lines').innerHTML = q.lines.map((l) => `<li class="${l.amount < 0 ? 'neg' : ''}"><span>${esc(l.label)}</span><b>${l.amount < 0 ? '-' : ''}${money(cfg, Math.abs(l.amount))}</b></li>`).join('');
      $('#sum-total').textContent = money(cfg, q.total);
      $('#sum-deposit').textContent = q.deposit ? `Refundable deposit of ${money(cfg, q.deposit)} is held at pick-up.` : 'No deposit with GearPilot.';
      const bad = !q.carAvailable || q.driverAvailable === false;
      $('#sum-avail').innerHTML = `<div class="alert ${bad ? 'error' : 'ok'}">${!q.carAvailable ? 'This car is not available for those dates.' : q.driverAvailable === false ? 'No GearPilot driver available for those dates.' : 'Available for your dates.'}</div>`;
      $('#to-step2').disabled = bad;
      if (f.driverMode.value === 'chauffeur') $('#ch-avail').textContent = q.driverAvailable ? 'GearPilot driver available for your dates' : 'No GearPilot driver free for your dates';
      $('#ch-avail').className = `avail ${q.driverAvailable === false ? 'bad' : 'good'}`;
    } catch (err) {
      $('#sum-lines').innerHTML = ''; $('#sum-total').textContent = '-'; $('#to-step2').disabled = true;
      notice($('#sum-avail'), 'error', err.details ? Object.values(err.details)[0] : err.message);
    }
  }
  const queueQuote = () => { clearTimeout(quoteTimer); quoteTimer = setTimeout(refreshQuote, 150); };

  async function checkChauffeur() {
    const f = form();
    if (!f.start.value || !f.end.value || f.end.value <= f.start.value) return;
    try { const a = await api(`/availability/driver?start=${f.start.value}&end=${f.end.value}`); $('#ch-avail').textContent = a.available ? `${a.driversFree} GearPilot driver${a.driversFree > 1 ? 's' : ''} available` : 'No GearPilot driver free for those dates'; $('#ch-avail').className = `avail ${a.available ? 'good' : 'bad'}`; }
    catch { $('#ch-avail').textContent = ''; }
  }

  function applyDriverMode() {
    const chauffeur = form().driverMode.value === 'chauffeur';
    $('#licence-block').classList.toggle('hidden', chauffeur);
    $$('input[name=addon]').forEach((a) => { const sOnly = a.dataset.selfOnly === 'true'; a.disabled = chauffeur && sOnly; if (a.disabled) a.checked = false; a.closest('.option-card').style.opacity = a.disabled ? '.45' : ''; });
  }

  document.addEventListener('vr:ready', async () => {
    cfg = await window.VR.getConfig();
    const [locs, all] = await Promise.all([api('/locations'), api('/cars')]);
    cars = all;
    const f = form();
    $('#min-age').textContent = `(${cfg.rental.minDriverAge}+)`;
    $('#ch-price').textContent = `(${money(cfg, cfg.rental.chauffeurDailyRate)}/day)`;
    const lopts = locs.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    f.pickupLocationId.innerHTML = lopts; f.dropoffLocationId.innerHTML = lopts;
    f.carId.innerHTML = cars.map((c) => `<option value="${c.id}">${esc(c.make)} ${esc(c.model)} - ${money(cfg, c.pricePerDay)}/day</option>`).join('');
    $('#addons').innerHTML = cfg.addons.map((a) => `<label class="option-card"><input type="checkbox" name="addon" value="${esc(a.id)}" data-self-only="${a.selfOnly}"><span class="grow"><b>${esc(a.label)}</b><small>${esc(a.description)}</small></span><b>${money(cfg, a.price)}/day</b></label>`).join('');
    f.start.min = todayStr(); f.end.min = todayStr(1);
    f.start.value = params.get('start') || todayStr(3); f.end.value = params.get('end') || todayStr(6);
    if (params.get('carId') && cars.some((c) => c.id === +params.get('carId'))) f.carId.value = params.get('carId');
    if (params.get('pickup')) f.pickupLocationId.value = params.get('pickup');
    if (params.get('dropoff')) f.dropoffLocationId.value = params.get('dropoff');
    if (params.get('driver') === 'chauffeur') f.driverMode.value = 'chauffeur';
    f.dateOfBirth.max = todayStr(-365 * 18);
    f.dateOfBirth.min = cfg.rental.earliestDateOfBirth;
    f.licenceExpiry.max = cfg.rental.latestLicenceExpiry;

    f.start.addEventListener('change', () => { const min = new Date(Date.parse(f.start.value) + 86400000).toISOString().slice(0, 10); f.end.min = min; if (f.end.value <= f.start.value) f.end.value = min; });
    ['pickupLocationId', 'dropoffLocationId', 'start', 'end', 'carId', 'driverMode', 'dateOfBirth'].forEach((n) => $$(`[name=${n}]`, f).forEach((el) => el.addEventListener('change', () => { applyDriverMode(); queueQuote(); if (n === 'start' || n === 'end') checkChauffeur(); })));
    $('#addons').addEventListener('change', queueQuote);
    applyDriverMode(); checkChauffeur(); refreshQuote();

    $('#to-step2').addEventListener('click', () => {
      if (!f.start.value || !f.end.value || f.end.value <= f.start.value) return notice($('#top-msg'), 'error', 'Return date must be after pick-up date.');
      notice($('#top-msg'), 'info', ''); setStep(2);
    });
    $('#back1').addEventListener('click', () => setStep(1));

    f.addEventListener('submit', async (e) => {
      e.preventDefault(); clearFieldErrors(f); $('#book-err').classList.add('hidden');
      const body = {
        ...tripBody(), customerName: f.customerName.value, customerEmail: f.customerEmail.value, customerPhone: f.customerPhone.value, dateOfBirth: f.dateOfBirth.value,
        licenceNumber: f.licenceNumber.value, licenceCountry: f.licenceCountry.value, licenceExpiry: f.licenceExpiry.value,
        paymentMethod: f.paymentMethod.value, notes: f.notes.value, acceptTerms: f.acceptTerms.checked,
      };
      if (body.driverMode === 'chauffeur') { delete body.licenceNumber; delete body.licenceCountry; delete body.licenceExpiry; }
      $('#confirm-btn').disabled = true;
      try {
        const b = await api('/bookings', { method: 'POST', body });
        const box = $('#step3');
        box.innerHTML = `<div class="confirm-box"><div class="check-anim">${icon('check')}</div><h2>You're booked!</h2><p class="muted">A confirmation reference for ${esc(b.customerName)}. Keep it safe, you'll need it with your email to view or cancel.</p>
          <div class="ref" id="ref">${esc(b.ref)}</div>
          <ul class="lines"><li><span>Car</span><b>${esc(b.car)}</b></li><li><span>Dates</span><b>${fmtDate(b.start)} to ${fmtDate(b.end)} (${b.days} days)</b></li><li><span>Pick-up</span><b>${esc(b.pickupLocation)}</b></li><li><span>Drop-off</span><b>${esc(b.dropoffLocation)}</b></li>
          <li><span>Driver</span><b>${b.chauffeur ? `GearPilot driver: ${esc(b.chauffeur)}` : 'Self-drive'}</b></li><li><span>Total</span><b>${money(cfg, b.total)}</b></li>${b.deposit ? `<li><span>Deposit at pick-up</span><b>${money(cfg, b.deposit)}</b></li>` : ''}</ul>
          <p><a class="btn" href="/manage">View my booking</a> <a class="btn ghost" href="/">Back to home</a></p><p class="muted">Questions? Call ${esc(cfg.business.phone)}.</p></div>`;
        setStep(3);
        $('#ref').focus();
      } catch (err) {
        $('#book-err').textContent = err.message; $('#book-err').classList.remove('hidden');
        showFieldErrors(f, err.details);
        if (err.status === 409) { setStep(1); notice($('#top-msg'), 'error', err.message); refreshQuote(); }
      } finally { $('#confirm-btn').disabled = false; }
    });
    setStep(1);
    window.initDatePickers();
  });
})();
