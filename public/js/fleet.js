'use strict';
(function () {
  const { api, tint, icon, esc, $, $$, stars, carSvg, carArt, hasPhoto, brandBadge, revealOnScroll, notice, todayStr, money, fmtDate, showFieldErrors, clearFieldErrors } = window.VR;
  const params = new URLSearchParams(location.search);
  let cfg, category = '', debounce, priceMax = 0;

  const starInput = (idp) => `<fieldset class="star-input field"><legend class="sr-only">Your rating</legend>${[5, 4, 3, 2, 1].map((n) =>
    `<input type="radio" id="${idp}${n}" name="rating" value="${n}"><label for="${idp}${n}" title="${n} star${n > 1 ? 's' : ''}">&#9733;<span class="sr-only">${n} star${n > 1 ? 's' : ''}</span></label>`).join('')}</fieldset>`;

  const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // Pick-up date + duration chosen in the filters (both needed for availability).
  const stay = () => { const start = $('#f-start').value, days = +$('#f-days').value; return start && days ? { start, days } : null; };

  // MVP: no online booking, so the action is an enquiry that goes through the checklist to WhatsApp.
  function bookUrl(c) {
    const p = new URLSearchParams({ carId: c.id, driver: $('input[name=driver]:checked').value });
    const st = stay();
    if (cfg.features.onlineBooking) {
      if (st) { p.set('start', st.start); p.set('end', addDays(st.start, st.days)); }
      for (const [k, v] of [['pickup', params.get('pickup')], ['dropoff', params.get('dropoff')]]) if (v) p.set(k, v);
      return `/book?${p}`;
    }
    if ($('#f-start').value) p.set('start', $('#f-start').value);
    if ($('#f-days').value) p.set('days', $('#f-days').value);
    return `/checklist?${p}`;
  }
  const bookLabel = () => (cfg.features.onlineBooking ? 'Book' : 'Enquire');

  async function load() {
    const q = new URLSearchParams();
    if (category) q.set('category', category);
    for (const [id, key] of [['f-brand', 'brand'], ['f-q', 'q'], ['f-trans', 'transmission'], ['f-fuel', 'fuel'], ['f-seats', 'seats'], ['f-sort', 'sort']]) if ($(`#${id}`).value) q.set(key, $(`#${id}`).value);
    if (+$('#f-price').value < priceMax) q.set('maxPrice', $('#f-price').value);
    const st = stay();
    if (st) { q.set('start', st.start); q.set('days', st.days); if ($('#f-avail').checked) q.set('availableOnly', 'true'); }
    let cars;
    try { cars = await api(`/cars?${q}`); } catch (err) { $('#cars').innerHTML = ''; $('#count').textContent = ''; return notice($('#cars'), 'error', err.details ? Object.values(err.details)[0] : err.message); }
    $('#count').textContent = `${cars.length} car${cars.length === 1 ? '' : 's'} found`;
    $('#cars').innerHTML = cars.length ? cars.map((c, i) => `<article class="car-card reveal${c.available === false ? ' unavailable' : ''}" data-delay="${i % 3}" data-car="${esc(c.color)}">
      <div class="car-stage${hasPhoto(c) ? ' photo' : ''}">${carArt(c, undefined, { thumb: true, eager: i < 6 })}${brandBadge(c)}<span class="car-badge${c.available === false ? ' bad' : ''}">${c.available === false ? 'Unavailable' : esc(c.category)}</span></div>
      <div class="car-body"><div class="car-title"><h3>${esc(c.make)} ${esc(c.model)}</h3><div class="price">${money(cfg, c.pricePerDay)}<small>/day</small></div></div>
      <div>${stars(c.rating.average, c.rating.count)}</div>
      <ul class="specs"><li>${icon('seat')} ${c.seats} seats</li><li>${icon('bag')} ${c.bags} bags</li><li>${icon('gear')} ${esc(c.transmission)}</li><li>${icon('fuel')} ${esc(c.fuel)}</li></ul>
      <div class="car-actions"><a class="btn small${c.available === false ? ' ghost' : ''}" href="${esc(bookUrl(c))}"${c.available === false ? ' aria-disabled="true" tabindex="-1"' : ''}>${bookLabel()}</a><button class="btn small ghost" type="button" data-details="${c.id}">Details &amp; reviews</button></div></div></article>`).join('')
      : '<p class="muted">No cars match those filters. Try widening them.</p>';
    tint(); revealOnScroll();
  }

  async function openDetails(id) {
    const car = await api(`/cars/${id}`);
    const dlg = $('#car-dialog');
    $('#dlg-body').innerHTML = `<div data-car="${esc(car.color)}" class="car-card"><div class="car-stage${hasPhoto(car) ? ' photo' : ''}">${carArt(car)}${brandBadge(car)}</div></div>
      <h2 id="dlg-title">${esc(car.make)} ${esc(car.model)}</h2>
      <div>${stars(car.rating.average, car.rating.count)}</div><p>${esc(car.description)}</p>
      <ul class="specs">${car.features.map((f) => `<li>${icon('check')} ${esc(f)}</li>`).join('')}</ul>
      <p><strong>${money(cfg, car.pricePerDay)}</strong> per day${cfg.features.onlineBooking ? ` &middot; deposit ${money(cfg, car.deposit)} (self-drive)` : ''}</p>
      <a class="btn" href="${esc(bookUrl(car))}">${cfg.features.onlineBooking ? 'Book this car' : 'Enquire about this car'}</a>
      <h3 class="mt">Rate this car</h3>
      <form id="review-form" novalidate>${starInput('rv')}<div class="form-grid"><div class="field"><label for="rv-name">Your name</label><input id="rv-name" name="author" maxlength="60" required></div>
      <div class="field"><label for="rv-comment">Comment (optional)</label><input id="rv-comment" name="comment" maxlength="600"></div></div>
      <button class="btn small" type="submit">Submit rating</button><div id="rv-out" aria-live="polite"></div></form>
      <h3 class="mt">Customer reviews</h3><div id="rv-list">${car.reviews.length ? car.reviews.map((r) => `<div class="review">${stars(r.rating, 0).replace(/<span class="stars-text">.*<\/span>/, '')} <strong>${esc(r.author)}</strong><p>${esc(r.comment)}</p></div>`).join('') : '<p class="muted">No reviews yet. Be the first!</p>'}</div>`;
    tint($('#dlg-body'));
    $('#review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; clearFieldErrors(f);
      if (!f.rating.value) return notice($('#rv-out'), 'error', 'Please choose a star rating.');
      try { await api(`/cars/${id}/reviews`, { method: 'POST', body: { rating: f.rating.value, author: f.author.value, comment: f.comment.value } }); await openDetails(id); load(); }
      catch (err) { notice($('#rv-out'), 'error', err.message); showFieldErrors(f, err.details); }
    });
    if (!dlg.open) dlg.showModal();
  }

  document.addEventListener('vr:ready', async () => {
    cfg = await window.VR.getConfig();
    const allCars = await api('/cars');
    const present = new Set(allCars.map((c) => c.category));
    const prices = allCars.map((c) => c.pricePerDay);
    const pMin = Math.floor(Math.min(...prices) / 100) * 100, pMax = Math.ceil(Math.max(...prices) / 100) * 100;
    priceMax = pMax;
    Object.assign($('#f-price'), { min: pMin, max: pMax, step: 100, value: pMax });
    $('#f-brand').innerHTML += Object.entries(cfg.brands).map(([slug, name]) => `<option value="${slug}">${esc(name)}</option>`).join('');
    if (params.get('brand') && cfg.brands[params.get('brand')]) $('#f-brand').value = params.get('brand');
    if (['petrol', 'diesel', 'hybrid', 'electric', 'cng'].includes(params.get('fuel'))) $('#f-fuel').value = params.get('fuel');
    if (['price_asc', 'price_desc', 'rating', 'newest'].includes(params.get('sort'))) $('#f-sort').value = params.get('sort');
    $('#cats').innerHTML = ['', ...cfg.categories.filter((c) => present.has(c))].map((c) => `<button type="button" data-cat="${c}" aria-pressed="${c === ''}">${c || 'All'}</button>`).join('');
    $('#cats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; category = b.dataset.cat; $$('#cats button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); });
    $('#f-start').min = todayStr();
    // Accept ?start&days (new) and ?start&end (older links).
    if (params.get('start')) {
      const days = +params.get('days') || (params.get('end') ? Math.round((Date.parse(params.get('end')) - Date.parse(params.get('start'))) / 86400000) : 0);
      const option = $(`#f-days option[value="${days}"]`);
      if (option) { $('#f-start').value = params.get('start'); $('#f-days').value = String(days); $('#f-avail').checked = true; }
    }
    if (params.get('driver') === 'chauffeur') $('#m-chauffeur').checked = true;
    if (params.get('category')) { category = params.get('category'); }
    const out = $('#f-price-out'); const sync = () => { out.textContent = +$('#f-price').value >= priceMax ? 'any' : money(cfg, $('#f-price').value); }; sync();
    $('#filters').addEventListener('input', () => { sync(); clearTimeout(debounce); debounce = setTimeout(load, 200); });
    $('#filters').addEventListener('reset', () => setTimeout(() => { $('#f-price').value = priceMax; category = ''; $$('#cats button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === ''))); sync(); load(); }));
    $$('input[name=driver]').forEach((r) => r.addEventListener('change', load));
    $('#cars').addEventListener('click', (e) => { const b = e.target.closest('[data-details]'); if (b) openDetails(b.dataset.details); const a = e.target.closest('a[aria-disabled=true]'); if (a) e.preventDefault(); });
    $('#dlg-close').addEventListener('click', () => $('#car-dialog').close());
    $('#car-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
    window.initDatePickers();
    load();
  });
})();
