'use strict';
(function () {
  const { api, esc, $, $$, notice, money, fmtDate, clearFieldErrors, showFieldErrors } = window.VR;
  const KEY = 'vr_admin_token'; // sessionStorage: cleared when the tab closes
  let cfg, token = sessionStorage.getItem(KEY), tab = 'bookings';
  const call = (path, opts = {}) => api(path, { ...opts, token }).catch((e) => { if (e.status === 401 && token) logout(); throw e; });

  const TABS = { bookings: 'Bookings', cars: 'Cars', drivers: 'GearPilot drivers', feedback: 'Feedback', reviews: 'Car ratings', import: 'Import reviews' };

  function logout() { token = null; sessionStorage.removeItem(KEY); $('#app-view').classList.add('hidden'); $('#login-view').classList.remove('hidden'); }
  const table = (cols, rows) => `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${cols.length}" class="muted">Nothing here yet.</td></tr>`}</tbody></table></div>`;
  const btn = (label, attrs, cls = 'ghost') => `<button class="btn small ${cls}" type="button" ${attrs}>${label}</button>`;

  async function showKpis() {
    const s = await call('/admin/summary');
    $('#kpis').innerHTML = [['Active cars', s.cars], ['Bookings', s.bookings], ['Upcoming', s.upcoming], ['Revenue', money(cfg, s.revenue)], ['Feedback to review', s.pendingFeedback]].map(([l, v]) => `<div class="kpi"><b>${esc(v)}</b>${l}</div>`).join('');
  }

  const views = {
    async bookings() {
      const rows = await call('/admin/bookings');
      return table(['Ref', 'Customer', 'Car', 'Dates', 'Driver', 'Total', 'Status', 'Actions'], rows.map((b) => `<tr><td>${esc(b.ref)}</td><td>${esc(b.customer_name)}<br><small class="muted">${esc(b.customer_email)}<br>${esc(b.customer_phone)}</small></td><td>${esc(b.car)}</td>
        <td>${fmtDate(b.start_date)} &rarr; ${fmtDate(b.end_date)}</td><td>${b.driver_mode === 'chauffeur' ? esc(b.driver || 'GearPilot') : `Self<br><small class="muted">${esc(b.licence_number || '')}</small>`}</td><td>${money(cfg, b.total)}</td>
        <td><span class="pill ${esc(b.status)}">${esc(b.status)}</span></td><td><div class="row-actions"><label class="sr-only" for="st${b.id}">Status for ${esc(b.ref)}</label><select id="st${b.id}" data-status="${b.id}">${['confirmed', 'active', 'completed', 'cancelled'].map((s) => `<option${s === b.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div></td></tr>`));
    },
    async cars() {
      const rows = await call('/admin/cars');
      window.__cars = rows;
      return `<p>${btn('Add car', 'data-car-new', '')}</p>` + table(['Car', 'Category', 'Specs', 'Price/day', 'Visible', 'Actions'], rows.map((c) => `<tr><td>${esc(c.make)} ${esc(c.model)} (${c.year})</td><td>${esc(c.category)}</td><td>${c.seats} seats, ${esc(c.transmission)}, ${esc(c.fuel)}</td><td>${money(cfg, c.price_per_day)}</td><td>${c.active ? 'Yes' : 'Hidden'}</td>
        <td><div class="row-actions">${btn('Edit', `data-car-edit="${c.id}"`)}${c.active ? btn('Hide', `data-car-del="${c.id}"`, 'danger') : ''}</div></td></tr>`));
    },
    async drivers() {
      const rows = await call('/admin/drivers');
      return `<form id="driver-add" class="panel mt" novalidate><h3>Add GearPilot driver</h3><div class="form-grid"><div class="field"><label for="dr-n">Name</label><input id="dr-n" name="name" required></div><div class="field"><label for="dr-l">Languages</label><input id="dr-l" name="languages" value="English" required></div><div class="field"><label for="dr-y">Years of experience</label><input id="dr-y" name="yearsExperience" type="number" min="0" value="5" required></div></div><button class="btn small" type="submit">Add</button><div id="dr-msg"></div></form>`
        + table(['Name', 'Languages', 'Experience', 'Active', 'Actions'], rows.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.languages)}</td><td>${d.years_experience} yrs</td><td>${d.active ? 'Yes' : 'No'}</td><td>${btn(d.active ? 'Deactivate' : 'Activate', `data-driver="${d.id}" data-active="${d.active ? 0 : 1}"`)}</td></tr>`));
    },
    async feedback() {
      const rows = await call('/admin/feedback');
      return table(['Date', 'From', 'Rating', 'Message', 'Publish?', 'Status', 'Actions'], rows.map((f) => `<tr><td>${esc(f.created_at.slice(0, 10))}</td><td>${esc(f.name)}<br><small class="muted">${esc(f.email)}</small></td><td>${f.rating}/5</td><td>${esc(f.message)}</td><td>${f.allow_publish ? 'Consented' : 'No'}</td><td>${f.approved ? 'Published' : 'Pending'}</td>
        <td><div class="row-actions">${btn(f.approved ? 'Unpublish' : 'Approve', `data-fb="${f.id}" data-approved="${f.approved ? 0 : 1}"`)}${btn('Delete', `data-fb-del="${f.id}"`, 'danger')}</div></td></tr>`));
    },
    async import() {
      return `<form id="rv-import" class="panel mt" novalidate><h3>Import customer reviews (e.g. from Google)</h3>
        <p class="muted">Paste a JSON array. Each review needs <code>author</code> and <code>rating</code> (1-5); <code>text</code>, <code>date</code> (YYYY-MM-DD) and <code>url</code> are optional. Duplicates are skipped. The newest 5 appear on the home page and all of them on the reviews page.</p>
        <div class="field"><label for="rv-json">Reviews (JSON)</label><textarea id="rv-json" rows="10" placeholder='[{"author":"Arun K.","rating":5,"text":"Clean car and polite staff","date":"2026-10-20"}]'></textarea></div>
        <label class="check field"><input type="checkbox" id="rv-replace"> Replace previously imported reviews</label>
        <button class="btn small" type="submit">Import reviews</button><div id="rv-import-msg" aria-live="polite"></div></form>`;
    },
    async reviews() {
      const rows = await call('/admin/reviews');
      return table(['Date', 'Car', 'Rating', 'Author', 'Comment', 'Actions'], rows.map((r) => `<tr><td>${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.car)}</td><td>${r.rating}/5</td><td>${esc(r.author)}</td><td>${esc(r.comment)}</td><td>${btn('Delete', `data-rv-del="${r.id}"`, 'danger')}</td></tr>`));
    },
  };

  async function show(name) {
    tab = name;
    $('#tabs').innerHTML = Object.entries(TABS).map(([k, v]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${k === name}">${v}</button>`).join('');
    try { $('#panel').innerHTML = await views[name](); await showKpis(); } catch (e) { notice($('#panel'), 'error', e.message); }
  }

  async function carDialog(car) {
    const f = $('#car-form'); clearFieldErrors(f); f.reset(); $('#cf-err').classList.add('hidden');
    $('#cf-cat').innerHTML = cfg.categories.map((c) => `<option>${c}</option>`).join('');
    $('#cf-brand').innerHTML = Object.entries(cfg.brands).map(([slug, name]) => `<option value="${slug}">${esc(name)}</option>`).join('');
    $('#cf-title').textContent = car ? 'Edit car' : 'Add car';
    f.id.value = car ? car.id : '';
    if (car) { f.image.value = car.image || ''; f.brand.value = car.brand; for (const k of ['make', 'model', 'year', 'category', 'body', 'color', 'transmission', 'fuel', 'seats', 'bags', 'description', 'deposit']) f[k].value = car[k]; f.pricePerDay.value = car.price_per_day; f.features.value = car.features.join(', '); f.active.checked = !!car.active; }
    $('#car-form-dialog').showModal();
  }

  async function mutate(fn) { try { await fn(); await show(tab); } catch (e) { notice($('#panel'), 'error', e.message); } }

  document.addEventListener('vr:ready', async () => {
    cfg = await window.VR.getConfig();
    const enter = () => { $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); show(tab); };
    if (token) enter();
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const r = await api('/auth/login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } }); token = r.token; sessionStorage.setItem(KEY, token); e.target.reset(); notice($('#login-msg'), 'info', ''); enter(); }
      catch (err) { notice($('#login-msg'), 'error', err.message); }
    });
    $('#logout').addEventListener('click', logout);
    $('#cf-close').addEventListener('click', () => $('#car-form-dialog').close());

    $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
    $('#panel').addEventListener('change', (e) => { const s = e.target.closest('[data-status]'); if (s) mutate(() => call(`/admin/bookings/${s.dataset.status}`, { method: 'PATCH', body: { status: s.value } })); });
    $('#panel').addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if ('carNew' in d) carDialog(null);
      else if (d.carEdit) carDialog(window.__cars.find((c) => c.id === +d.carEdit));
      else if (d.carDel) { if (confirm('Hide this car from customers? Booking history is kept.')) mutate(() => call(`/admin/cars/${d.carDel}`, { method: 'DELETE' })); }
      else if (d.driver) mutate(() => call(`/admin/drivers/${d.driver}`, { method: 'PATCH', body: { active: d.active === '1' } }));
      else if (d.fb) mutate(() => call(`/admin/feedback/${d.fb}`, { method: 'PATCH', body: { approved: d.approved === '1' } }));
      else if (d.fbDel) { if (confirm('Delete this feedback?')) mutate(() => call(`/admin/feedback/${d.fbDel}`, { method: 'DELETE' })); }
      else if (d.rvDel) { if (confirm('Delete this rating?')) mutate(() => call(`/admin/reviews/${d.rvDel}`, { method: 'DELETE' })); }
    });
    $('#panel').addEventListener('submit', async (e) => {
      if (e.target.id === 'rv-import') {
        e.preventDefault();
        let list;
        try { list = JSON.parse($('#rv-json').value); } catch { return notice($('#rv-import-msg'), 'error', 'That is not valid JSON.'); }
        try {
          const r = await call('/admin/reviews/import', { method: 'POST', body: { reviews: list, replace: $('#rv-replace').checked } });
          notice($('#rv-import-msg'), 'ok', `Imported ${r.added} review(s); skipped ${r.skippedDuplicates} duplicate(s).`);
        } catch (err) { notice($('#rv-import-msg'), 'error', err.details ? Object.entries(err.details).map(([k, v]) => k + ': ' + v).join('; ') : err.message); }
        return;
      }
      if (e.target.id !== 'driver-add') return;
      e.preventDefault();
      const f = e.target;
      try { await call('/admin/drivers', { method: 'POST', body: { name: f.name.value, languages: f.languages.value, yearsExperience: f.yearsExperience.value } }); await show('drivers'); }
      catch (err) { notice($('#dr-msg'), 'error', err.message); showFieldErrors(f, err.details); }
    });
    $('#car-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; clearFieldErrors(f);
      const body = { brand: f.brand.value, image: f.image.value, make: f.make.value, model: f.model.value, year: f.year.value, category: f.category.value, body: f.body.value, color: f.color.value, transmission: f.transmission.value, fuel: f.fuel.value,
        seats: f.seats.value, bags: f.bags.value, pricePerDay: f.pricePerDay.value, deposit: f.deposit.value, description: f.description.value, features: f.features.value.split(','), active: f.active.checked };
      try {
        await call(f.id.value ? `/admin/cars/${f.id.value}` : '/admin/cars', { method: f.id.value ? 'PUT' : 'POST', body });
        $('#car-form-dialog').close(); show('cars');
      } catch (err) { $('#cf-err').textContent = err.message; $('#cf-err').classList.remove('hidden'); showFieldErrors(f, err.details); }
    });
  });
})();
