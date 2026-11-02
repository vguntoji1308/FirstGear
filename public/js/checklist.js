'use strict';
(function () {
  const { api, esc, $, $$, icon, money, fmtDate, waLink } = window.VR;
  const params = new URLSearchParams(location.search);

  // Edit this list to change what customers must acknowledge. Rental rules come from /api/config so they stay in step with the server.
  const items = (r) => [
    `I am at least ${r.minDriverAge} years old and hold a valid driving licence that will not expire during the rental.`,
    'I will bring my original driving licence and a government photo ID to pick-up.',
    'I understand there is no online payment: the rate, deposit and payment method are agreed with First Gear on WhatsApp or at pick-up.',
    'I will check the car with the First Gear team at pick-up and report any existing damage before I drive away.',
    'I will return the car on the agreed date and time, with the fuel level agreed at pick-up.',
    `I understand rentals are limited to ${r.maxRentalDays} days and that my booking is only confirmed once First Gear replies to confirm it.`,
  ];

  const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  document.addEventListener('vr:ready', async () => {
    const cfg = await window.VR.getConfig();
    const b = cfg.business, tel = b.phone.replace(/[^+\d]/g, '');

    const start = /^\d{4}-\d{2}-\d{2}$/.test(params.get('start') || '') ? params.get('start') : '';
    let days = Number(params.get('days')) || 0;
    if (!days && start && /^\d{4}-\d{2}-\d{2}$/.test(params.get('end') || '')) days = daysBetween(start, params.get('end'));
    days = Number.isInteger(days) && days >= 1 && days <= cfg.rental.maxRentalDays ? days : 0;
    const car = params.get('carId') ? await api(`/cars/${encodeURIComponent(params.get('carId'))}`).catch(() => null) : null;

    $('#cl-trip').innerHTML = car || start
      ? `<ul class="lines">${car ? `<li><span>Car</span><b>${esc(car.make)} ${esc(car.model)}</b></li><li><span>Rate</span><b>${money(cfg, car.pricePerDay)} / day</b></li>` : ''}${start ? `<li><span>Pick-up</span><b>${fmtDate(start)}</b></li>` : ''}${days ? `<li><span>Duration</span><b>${days} day${days === 1 ? '' : 's'}${start ? ` (return ${fmtDate(addDays(start, days))})` : ''}</b></li>` : ''}</ul>`
      : '<p class="muted">No car selected yet. <a href="/fleet">Browse the fleet</a> to pick one, or just message us and we will help.</p>';

    const list = items(cfg.rental);
    $('#cl-items').innerHTML = list.map((text, i) => `<li><label class="check"><input type="checkbox" name="item" value="${i}"> <span>${esc(text)}</span></label></li>`).join('');

    const message = () => {
      const trip = car ? `the ${car.make} ${car.model}` : 'a car';
      const when = start ? ` from ${fmtDate(start)}${days ? ` for ${days} day${days === 1 ? '' : 's'}` : ''}` : '';
      return `Hi First Gear, I would like to rent ${trip}${when}. I have read the rental checklist.`;
    };
    const wa = $('#cl-whatsapp');
    wa.href = waLink(cfg, message()) || '#';
    $('#cl-call').href = `tel:${tel}`; $('#cl-call').innerHTML = `${icon('phone')} Call ${esc(b.phone)}`;

    const sync = () => {
      const done = $$('input[name=item]:checked').length === list.length;
      wa.setAttribute('aria-disabled', String(!done));
      wa.tabIndex = done ? 0 : -1;
      $('#cl-progress').textContent = done ? 'All set. Continue on WhatsApp to confirm availability and price.' : `${$$('input[name=item]:checked').length} of ${list.length} confirmed.`;
    };
    $('#checklist-form').addEventListener('change', sync);
    wa.addEventListener('click', (e) => { if (wa.getAttribute('aria-disabled') === 'true' || wa.getAttribute('href') === '#') e.preventDefault(); });
    sync();
  });
})();
