'use strict';
(function () {
  const { api, tint, icon, esc, $, stars, carSvg, carArt, hasPhoto, brandBadge, revealOnScroll, notice, todayStr, money, socialLinks, showFieldErrors, clearFieldErrors } = window.VR;

  const TERMS = [
    ['Driver requirements', '<p>Self-drive renters must be at least {minAge} years old and hold a full, valid driving licence for the whole rental. Drivers under {young} pay a young-driver fee of {youngFee} per day. GearPilot bookings need no licence from you (minimum age {chAge}).</p>'],
    ['Deposit and payment', '<p>A refundable security deposit is held at pick-up for self-drive rentals (shown for each car). GearPilot bookings need no deposit. You can pay at the desk by major credit or debit card.</p>'],
    ['Cancellation and changes', '<p>Cancel for free up to {cancel} hours before pick-up from the "My booking" page. Later cancellations and changes are at our discretion, so please call us.</p>'],
    ['Fuel, mileage and returns', '<ul><li>Full-to-full fuel policy. Electric cars are returned with at least 20% charge.</li><li>250 km per day included; extra distance is charged per km.</li><li>Late returns are charged per hour, then as a full extra day.</li></ul>'],
    ['Insurance and damage', '<p>Basic collision cover is included with an excess. Add full protection at checkout for zero excess. Tyres, glass and underbody are covered only with full protection. Report any incident to us immediately.</p>'],
    ['Use of the vehicle', '<p>No smoking. Pets only by prior arrangement. Cross-border travel needs written permission. The car may not be used for racing, towing (unless equipped) or by unlisted drivers.</p>'],
    ['GearPilot service', '<p>GearPilot drivers drive up to 10 hours per day. Extra hours and waiting time are charged at an hourly rate. Tolls, parking and the GearPilot driver\'s accommodation on multi-city trips are not included.</p>'],
  ];

  function premiumCarousel(cars, cfg) {
    const premium = cars.filter((c) => c.image && c.model !== 'Thar')
      .sort((a, b) => b.pricePerDay - a.pricePerDay || a.id - b.id)
      .filter((c, i, all) => all.findIndex((other) => other.make === c.make && other.model === c.model) === i)
      .slice(0, 5);
    const thar = cars.find((c) => c.model === 'Thar' && c.image);
    const selected = [...(thar ? [thar] : []), ...premium];
    if (!selected.length) return;
    $('#hero-art').innerHTML = `<section class="hero-premium" aria-label="Premium fleet carousel" aria-roledescription="carousel">
      <div class="premium-slides" id="premium-slides" aria-live="off">${selected.map((c, i) => `<a class="premium-slide${i ? '' : ' is-current'}" href="/book?carId=${c.id}" aria-label="Book ${esc(c.make)} ${esc(c.model)}" data-slide="${i}"${i ? ' inert aria-hidden="true"' : ''}>
        <img src="${esc(c.model === 'Thar' ? '/img/cars/thumb/hero-48.webp' : c.image)}" alt="${esc(c.make)} ${esc(c.model)}" decoding="async" loading="eager">
        <span><strong>${esc(c.make)} ${esc(c.model)}</strong><small>${money(cfg, c.pricePerDay)} / day</small></span></a>`).join('')}</div>
      <div class="premium-controls"><div class="premium-dots" aria-label="Car position">${selected.map((c, i) => `<span class="premium-dot${i ? '' : ' is-current'}" aria-label="${esc(c.make)} ${esc(c.model)}"${i ? '' : ' aria-current="true"'}></span>`).join('')}</div></div>
    </section>`;
    const root = $('.hero-premium'), slides = [...root.querySelectorAll('.premium-slide')];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0, paused = motion.matches, hovered = false, timer;
    function display(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => {
        slide.classList.toggle('is-current', i === index);
        slide.inert = i !== index;
        slide.setAttribute('aria-hidden', String(i !== index));
      });
      root.querySelectorAll('.premium-dot').forEach((dot, i) => {
        dot.classList.toggle('is-current', i === index);
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }
    function schedule() {
      clearInterval(timer);
      if (!paused && !hovered && !document.hidden && !root.contains(document.activeElement) && slides.length > 1) {
        timer = setInterval(() => display(index + 1), 2000);
      }
    }
    root.querySelectorAll('.premium-slide img').forEach((image) => {
      image.addEventListener('mouseenter', () => { hovered = true; schedule(); });
      image.addEventListener('mouseleave', () => { hovered = false; schedule(); });
    });
    root.addEventListener('focusin', schedule);
    root.addEventListener('focusout', () => setTimeout(schedule, 0));
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', () => { paused = motion.matches; schedule(); });
    window.addEventListener('pagehide', () => clearInterval(timer));
    window.addEventListener('pageshow', schedule);
    display(0); schedule();
  }

  document.addEventListener('vr:ready', async () => {
    const cfg = await window.VR.getConfig();
    const b = cfg.business, r = cfg.rental, tel = b.phone.replace(/[^+\d]/g, '');

    $('#hero-art').innerHTML = '<div class="hero-car"><div class="car-stage hero-stage" data-car="#7c5cff"><img class="car-photo" src="/img/cars/thumb/hero-48.webp" alt="Mahindra Thar" decoding="async" fetchpriority="high"></div></div>';
    tint($('#hero-art'));
    $('#chip-phone').innerHTML = `${icon('phone')} ${esc(b.phone)}`;
    $('#chip-free').innerHTML = `${icon('check')} Free cancellation up to ${r.freeCancellationHours}h`;
    ['shield:i2', 'bolt:i1', 'pin:i3', 'user:i4'].forEach((p) => { const [n, id] = p.split(':'); $(`#${id}`).innerHTML = icon(n); });
    $('#chauffeur-ticks').innerHTML = [`Professional chauffeur from ${money(cfg, r.chauffeurDailyRate)} per day`, 'Vetted, experienced and multilingual drivers', 'No licence or deposit needed from you', 'Add any car, from city hatch to executive saloon'].map((t) => `<li>${icon('check')}<span>${esc(t)}</span></li>`).join('');

    // Search form
    const locs = await api('/locations');
    const opts = locs.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    $('#s-pickup').innerHTML = opts; $('#s-dropoff').innerHTML = opts;
    const start = $('#s-start'), end = $('#s-end');
    start.min = todayStr(); start.value = todayStr(3); end.min = todayStr(1); end.value = todayStr(6);
    start.addEventListener('change', () => { const min = new Date(Date.parse(start.value) + 86400000).toISOString().slice(0, 10); end.min = min; if (end.value <= start.value) end.value = min; });
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (end.value <= start.value) return notice($('#search-msg'), 'error', 'Return date must be after pick-up date.');
      const p = new URLSearchParams({ start: start.value, end: end.value, pickup: $('#s-pickup').value, dropoff: $('#s-dropoff').value, driver: e.target.driver.value });
      location.href = `/fleet?${p}`;
    });

    // Featured fleet
    const cars = await api('/cars?sort=rating');
    premiumCarousel(cars, cfg);
    $('#stat-rating').textContent = (() => { const rated = cars.filter((c) => c.rating.average); return rated.length ? (rated.reduce((s, c) => s + c.rating.average, 0) / rated.length).toFixed(1) : '-'; })();
    document.querySelector('[data-count]').textContent = cars.length;
    $('#featured').innerHTML = cars.slice(0, 6).map((c, i) => `<article class="car-card reveal" data-delay="${i % 3}" data-car="${esc(c.color)}">
      <div class="car-stage${hasPhoto(c) ? ' photo' : ''}">${carArt(c, undefined, { thumb: true, eager: i < 3 })}${brandBadge(c)}<span class="car-badge">${esc(c.category)}</span></div>
      <div class="car-body"><div class="car-title"><h3>${esc(c.make)} ${esc(c.model)}</h3><div class="price">${money(cfg, c.pricePerDay)}<small>/day</small></div></div>
      <div>${stars(c.rating.average, c.rating.count)}</div>
      <ul class="specs"><li>${icon('seat')} ${c.seats} seats</li><li>${icon('gear')} ${esc(c.transmission)}</li><li>${icon('fuel')} ${esc(c.fuel)}</li></ul>
      <div class="car-actions"><a class="btn small" href="/book?carId=${c.id}&amp;start=${todayStr(3)}&amp;end=${todayStr(6)}">Book</a><a class="btn small ghost" href="/fleet">Details</a></div></div></article>`).join('');
    tint();
    $('#brands-strip').innerHTML = Object.entries(cfg.brands).map(([slug, name]) => `<a href="/fleet?brand=${slug}" aria-label="${esc(name)} cars"><img class="brand-mark" src="/img/brands/${slug}-mark.svg" alt="" loading="lazy"><span>${esc(name)}</span></a>`).join('');
    revealOnScroll();

    // Terms
    const fill = (s) => s.replace('{minAge}', r.minDriverAge).replace('{young}', r.youngDriverUnder).replace('{youngFee}', money(cfg, r.youngDriverFeePerDay)).replace('{chAge}', r.minChauffeurAge || 18).replace('{cancel}', r.freeCancellationHours);
    $('#terms-list').innerHTML = TERMS.map(([t, body], i) => `<details class="term"${i === 0 ? ' open' : ''}><summary>${esc(t)}</summary>${fill(body)}</details>`).join('');

    // Reviews: the 5 most recent, with a link to the full list
    async function refreshReviews() {
      const rv = await api('/reviews?limit=5');
      $('#big-rating').innerHTML = window.VRReviews.summaryHtml(rv.summary);
      $('#testimonials').innerHTML = rv.items.length ? rv.items.map((x, i) => window.VRReviews.card(x, { delay: i })).join('') : '<p class="muted">Be the first to leave a review below.</p>';
      const more = $('#rv-more');
      more.classList.toggle('hidden', !rv.summary.count);
      $('#google-link').href = window.VR.safeUrl(rv.googleUrl);
      $('#rv-all').textContent = `View all ${rv.summary.count} review${rv.summary.count === 1 ? '' : 's'}`;
      revealOnScroll();
    }
    await refreshReviews();

    // GearPilot availability
    const ds = $('#dv-start'), de = $('#dv-end');
    ds.min = todayStr(); ds.value = todayStr(3); de.min = todayStr(1); de.value = todayStr(4);
    $('#driver-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = $('#driver-result');
      try {
        const a = await api(`/availability/driver?start=${ds.value}&end=${de.value}`);
        notice(out, a.available ? 'ok' : 'error', a.available ? `Good news: ${a.driversFree} GearPilot driver${a.driversFree > 1 ? 's' : ''} available. ${money(cfg, a.dailyRate)}/day.` : 'No GearPilot drivers are free for those dates. Try other dates or call us.');
      } catch (err) { notice(out, 'error', err.details ? Object.values(err.details)[0] : err.message); }
    });

    // Feedback
    $('#feedback-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; clearFieldErrors(f);
      const body = { name: f.name.value, email: f.email.value, rating: f.rating.value, message: f.message.value, allowPublish: f.allowPublish.checked };
      try {
        const res = await api('/feedback', { method: 'POST', body });
        f.reset(); notice($('#fb-msg-out'), 'ok', res.message);
        try { await refreshReviews(); }
        catch (err) { notice($('#fb-msg-out'), 'info', `${res.message} The reviews list could not refresh: ${err.message}. Open the Reviews page to retry.`); }
      }
      catch (err) { notice($('#fb-msg-out'), 'error', err.message); showFieldErrors(f, err.details); }
    });

    // Contact
    $('#contact-list').innerHTML = [['phone', '', `<a href="tel:${esc(tel)}">${esc(b.phone)}</a>`], ['mail', '', `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`], ['pin', 'Located at', esc(b.address)], ['clock', 'Working Hours', esc(b.hours)]]
      .map(([i, l, v]) => `<li><span class="ico">${icon(i)}</span><div>${l ? `<b>${l}</b>` : ''}${v}</div></li>`).join('');
    $('#contact-socials').innerHTML = socialLinks(cfg);
    $('#contact-call').href = `tel:${tel}`; $('#contact-call').innerHTML = `${icon('phone')} ${esc(b.phone)}`;
    $('#contact-chat').addEventListener('click', () => $('#chat-open').click());
    window.initDatePickers();
  });
})();
