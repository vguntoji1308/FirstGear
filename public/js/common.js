'use strict';
/* Shared client code: API helper, safe DOM helpers, icons, car art, header/footer, call button, chatbot widget. */
(function () {
  const ICONS = {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    shield: '<path d="M12 3 5 6v6c0 4.500 3 7.500 7 9 4-1.500 7-4.500 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    seat: '<path d="M7 4v9a3 3 0 0 0 3 3h7M7 4h3l1 8M5 20h14"/>',
    bag: '<rect x="5" y="8" width="14" height="12" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>',
    fuel: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M14 9h2a2 2 0 0 1 2 2v5a1.500 1.500 0 0 0 3 0V9l-3-3"/><path d="M7 8h5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400"/>',
    moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/>',
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.500c0-.300.200-.500.500-.500z"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.600"/><circle cx="17" cy="7" r=".6"/>',
    x: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>',
    youtube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10 9.500 5 2.500-5 2.500z"/>',
    whatsapp: '<path d="M4 20l1.300-4.200A8 8 0 1 1 8.400 18.900z"/><path d="M9 9c0 3 3 6 6 6l1-1.500-2-1-1 .700c-1-.500-1.700-1.200-2.200-2.200l.700-1-1-2z"/>',
  };
  const SOCIAL_LABELS = { facebook: 'Facebook', instagram: 'Instagram', x: 'X (Twitter)', youtube: 'YouTube', whatsapp: 'WhatsApp' };

  const FILLED = new Set(['x']);
  const icon = (name, cls = '') => `<svg class="icon ${FILLED.has(name) ? 'fill ' : ''}${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Only allow http(s) links from configuration to be rendered as hrefs.
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');

  async function api(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) { const e = new Error((data && data.error) || `Request failed (${res.status})`); e.status = res.status; e.details = data && data.details; throw e; }
    return data;
  }

  let cfgPromise;
  const getConfig = () => (cfgPromise = cfgPromise || api('/config'));
  const money = (cfg, n) => `${cfg.rental.currencySymbol}${Number(n).toLocaleString(cfg.rental.currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`;

  // Real photo when the car has one, otherwise the generated illustration.
  const SAFE_IMG = /^\/img\/cars\/[\w.-]+$/;
  // opts.thumb uses the small card-size file (~16 KB); opts.eager skips lazy loading for above-the-fold cards.
  function carArt(car, label, opts = {}) {
    const alt = label || `${car.make} ${car.model}`;
    if (car.image && SAFE_IMG.test(car.image)) {
      const src = opts.thumb ? car.image.replace('/img/cars/', '/img/cars/thumb/') : car.image;
      return `<img class="car-photo" src="${esc(src)}" data-full="${esc(car.image)}" alt="${esc(alt)}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async"${opts.eager ? ' fetchpriority="high"' : ''}>`;
    }
    return carSvg(car.body, car.color, alt);
  }
  const hasPhoto = (car) => !!(car.image && SAFE_IMG.test(car.image));
  // Manufacturer badge (files live in /img/brands/<slug>.svg; replace them with official logos if you have the rights).
  function brandBadge(car) {
    return /^[a-z-]+$/.test(car.brand || '') ? `<img class="brand-logo" src="/img/brands/${car.brand}.svg" alt="${esc(car.make)}" loading="lazy">` : '';
  }

  function stars(avg, count) {
    const full = Math.round(avg || 0);
    let out = '<span class="stars" role="img" aria-label="' + (avg ? `${avg} out of 5 stars` : 'No ratings yet') + '">';
    for (let i = 1; i <= 5; i++) out += `<svg class="${i <= full ? '' : 'off'}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.500 2.900 6 6.600.9-4.800 4.600 1.200 6.500L12 17.300l-5.900 3.200 1.200-6.500L2.500 9.400l6.600-.9z"/></svg>`;
    out += '</span>';
    return `${out}<span class="stars-text">${avg ? `${avg} (${count})` : 'No ratings yet'}</span>`;
  }

  // Original vector car art, tinted per car. All styling via attributes (strict CSP).
  let uid = 0;
  const BODIES = {
    hatch: { body: 'M35 118 L45 92 Q55 70 100 64 L230 62 Q275 64 300 84 L350 94 Q372 100 372 118 L372 126 L30 126Z', win: 'M92 88 Q104 72 124 70 L170 69 L172 90Z M182 69 L232 68 Q258 70 276 88 L184 90Z' },
    sedan: { body: 'M24 120 L40 94 Q58 70 118 64 L238 62 Q292 64 322 88 L368 98 Q384 104 384 120 L384 128 L20 128Z', win: 'M98 90 Q112 74 136 72 L186 71 L188 92Z M198 71 L246 70 Q272 72 296 90 L200 92Z' },
    suv: { body: 'M26 122 L34 80 Q42 56 92 52 L290 52 Q332 56 346 86 L376 98 Q388 104 388 120 L388 130 L22 130Z', win: 'M84 84 Q92 66 118 64 L176 63 L178 86Z M188 63 L282 63 Q310 66 326 86 L190 86Z' },
    sports: { body: 'M20 122 Q38 98 112 90 Q170 66 232 72 Q292 76 332 98 L380 106 Q394 112 392 124 L390 130 L20 130Z', win: 'M140 88 Q168 72 206 76 Q244 78 270 92 L146 94Z' },
    van: { body: 'M22 126 L22 62 Q22 46 44 46 L302 46 Q332 48 348 80 L380 96 Q392 102 392 118 L392 130 L22 130Z', win: 'M40 64 L110 64 L110 92 L40 92Z M122 64 L192 64 L192 92 L122 92Z M204 64 L286 64 Q312 66 326 92 L204 92Z' },
  };
  function carSvg(body, color, label) {
    const b = BODIES[body] || BODIES.sedan, id = `cg${++uid}`;
    const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c5cff';
    const wheel = (x) => `<circle cx="${x}" cy="130" r="23" fill="#0b0b12"/><circle cx="${x}" cy="130" r="13" fill="#2b2b3d"/><circle cx="${x}" cy="130" r="5" fill="#9aa0b8"/>`;
    return `<svg viewBox="0 0 410 165" role="img" aria-label="${esc(label || 'Car illustration')}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
      <ellipse cx="205" cy="152" rx="170" ry="9" fill="#000" opacity=".4"/>
      <path d="${b.body}" fill="${c}"/><path d="${b.body}" fill="url(#${id})"/>
      <path d="${b.win}" fill="#0d1226" opacity=".88"/><path d="${b.win}" fill="#9ec5ff" opacity=".18"/>
      <rect x="355" y="104" width="22" height="7" rx="3" fill="#fff6c8"/><rect x="26" y="104" width="14" height="7" rx="3" fill="#ff5c6c"/>
      ${wheel(98)}${wheel(310)}</svg>`;
  }

  // CSP forbids inline style attributes, so per-car colours are applied via CSSOM from data-car.
  const tint = (root = document) => $$('[data-car]', root).forEach((el) => { if (/^#[0-9a-f]{6}$/i.test(el.dataset.car)) el.style.setProperty('--car', el.dataset.car); });

  function revealOnScroll(root = document) {
    const els = $$('.reveal:not(.in)', root);
    if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  function field(el, message) {
    const wrap = el.closest('.field');
    if (!wrap) return;
    wrap.classList.toggle('invalid', !!message);
    let err = wrap.querySelector('.err');
    if (!err) { err = document.createElement('div'); err.className = 'err'; err.setAttribute('role', 'alert'); wrap.appendChild(err); }
    err.textContent = message || '';
  }
  function showFieldErrors(form, details) {
    let first = null;
    for (const [name, msg] of Object.entries(details || {})) {
      const control = form.elements[name];
      const el = control && control._flatpickr ? control._flatpickr.altInput : control;
      if (el) { field(el.length && !el.tagName ? el[0] : el, msg); first = first || el; }
    }
    if (first && first.focus) first.focus();
  }
  const clearFieldErrors = (form) => $$('.field', form).forEach((f) => { f.classList.remove('invalid'); const e = f.querySelector('.err'); if (e) e.textContent = ''; });
  function notice(container, type, text) {
    container.innerHTML = '';
    if (!text) return;
    const d = document.createElement('div'); d.className = `alert ${type}`; d.setAttribute('role', type === 'error' ? 'alert' : 'status'); d.textContent = text; container.appendChild(d);
  }
  const todayStr = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const fmtDate = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  /* ---------- Layout: header, footer, floating call, chatbot ---------- */
  const NAV = [['/', 'Home'], ['/fleet', 'Fleet'], ['/#chauffeur', 'GearPilot'], ['/#rental-terms', 'Rental terms'], ['/reviews', 'Reviews'], ['/#contact', 'Contact'], ['/manage', 'My booking'], ['/account', 'Sign in']];

  function socialLinks(cfg) {
    return Object.entries(cfg.business.social).filter(([k, u]) => SOCIAL_LABELS[k] && u).map(([k, u]) =>
      `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(SOCIAL_LABELS[k] || k)}">${icon(k)}</a></li>`).join('');
  }

  function buildLayout(cfg) {
    const b = cfg.business, tel = b.phone.replace(/[^+\d]/g, ''), path = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    const baseNav = path === '/admin' || path === '/admin/' ? NAV.map(([href, label]) => href === '/manage' ? ['/admin', 'Bookings'] : [href, label]) : NAV;
    const nav = cfg.env === 'dev' ? [...baseNav, ['/docs', 'Docs']] : baseNav;
    const header = document.getElementById('site-header');
    if (header) {
      header.className = 'site-header';
      header.innerHTML = `<div class="container nav">
        <a class="brand" href="/" aria-label="${esc(b.name)} home"><span class="logo-wrap"><img class="logo-light" src="/img/firstgear-logo.webp" alt="${esc(b.name)}"><img class="logo-dark" src="/img/firstgear-logo-dark.webp" alt="" aria-hidden="true"></span></a>
        <nav aria-label="Main"><ul class="nav-links" id="nav-links">${nav.map(([h, t]) => `<li><a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a></li>`).join('')}</ul></nav>
        <div class="nav-actions"><a class="nav-phone" href="tel:${esc(tel)}" aria-label="Call us on ${esc(b.phone)}">${icon('phone')}<span>${esc(b.phone)}</span></a>
        <a class="btn small" href="/fleet">Book now</a>
        <button class="theme-toggle" id="theme-toggle" type="button">${icon('sun', 'i-sun')}${icon('moon', 'i-moon')}</button>
        <button class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Toggle menu">${icon('menu')}</button></div></div>`;
      $('#theme-toggle').addEventListener('click', () => window.FGTheme.toggle());
      window.FGTheme.apply();
      if (sessionStorage.getItem('fg_customer_token')) $('#nav-links a[href="/account"]').textContent = 'Account';
      const links = $$('#nav-links a');
      const sectionLinks = new Map(nav.filter(([href]) => href.startsWith('/#')).map(([href]) => [href.slice(2), href]));
      sectionLinks.set('fleet', '/fleet');
      sectionLinks.set('reviews', '/reviews');
      const sections = path === '/' ? $$('main section[id]')
        .filter((element) => sectionLinks.has(element.id))
        .map((element) => ({ href: sectionLinks.get(element.id), element })) : [];
      const setActive = (href, section = false) => links.forEach((link) => {
        if (link.getAttribute('href') === href) link.setAttribute('aria-current', section || href.includes('#') ? 'location' : 'page');
        else link.removeAttribute('aria-current');
      });
      const syncSection = () => {
        let active = path;
        for (const section of sections) {
          if (section.element.getBoundingClientRect().top <= header.offsetHeight + 48) active = section.href;
        }
        if (path === '/book') active = '/fleet';
        if (path === '/admin/') active = '/admin';
        if (path === '/docs/') active = '/docs';
        setActive(active, path === '/' && active !== '/');
      };
      const onScroll = () => {
        header.classList.toggle('scrolled', window.scrollY > 24);
        syncSection();
      };
      onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('hashchange', () => {
        const href = `/${location.hash}`;
        if (path === '/' && links.some((link) => link.getAttribute('href') === href)) setActive(href);
      });
      $('#nav-links').addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (!link) return;
        $('#nav-links').classList.remove('open');
        $('#menu-toggle').setAttribute('aria-expanded', 'false');
        if (path === '/' && link.hash) setActive(link.getAttribute('href'));
      });
      header.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !$('#nav-links').classList.contains('open')) return;
        $('#nav-links').classList.remove('open');
        $('#menu-toggle').setAttribute('aria-expanded', 'false');
        $('#menu-toggle').focus();
      });
      document.addEventListener('click', (event) => {
        if (header.contains(event.target)) return;
        $('#nav-links').classList.remove('open');
        $('#menu-toggle').setAttribute('aria-expanded', 'false');
      });
      $('#menu-toggle').addEventListener('click', (e) => { const open = $('#nav-links').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
    }
    const footer = document.getElementById('site-footer');
    if (footer) {
      footer.className = 'site-footer';
      footer.innerHTML = `<div class="container"><div class="footer-grid">
        <div><a class="brand" href="/"><span class="logo-wrap"><img class="logo-light" src="/img/firstgear-logo.webp" alt="${esc(b.name)}"><img class="logo-dark" src="/img/firstgear-logo-dark.webp" alt="" aria-hidden="true"></span></a><p class="muted narrow">Your riding partner: honest prices, well-kept cars and professional GearPilot drivers, ready when you are.</p></div>
        <div><h4>Explore</h4><ul><li><a href="/fleet">Fleet</a></li><li><a href="/#chauffeur">GearPilot service</a></li><li><a href="/#rental-terms">Rental terms</a></li><li><a href="/manage">My booking</a></li></ul></div>
        <div><h4>Support</h4><ul><li><a href="/reviews">All reviews</a></li><li><a href="/#feedback">Give feedback</a></li><li><a href="/credits">Image credits</a></li><li><a href="/#contact">Contact</a></li><li><a href="/admin">Staff login</a></li></ul></div>
        <div><h4>Contact</h4><ul><li><a href="tel:${esc(tel)}">${icon('phone')} ${esc(b.phone)}</a></li><li><a href="mailto:${esc(b.email)}">${icon('mail')} ${esc(b.email)}</a></li></ul></div>
      </div><div class="footer-bottom"><span class="fb-note">*Prices exclude tax unless shown at checkout.</span><span class="fb-copy">&copy; ${new Date().getFullYear()} ${esc(b.name)}.</span></div></div>`;
    }
    if (cfg.env !== 'prod') { const badge = document.createElement('div'); badge.className = 'env-badge'; badge.textContent = `${cfg.env} environment`; document.body.appendChild(badge); }

    const stack = document.createElement('div');
    stack.className = 'fab-stack';
    stack.innerHTML = `<button class="fab chat" id="chat-open" aria-expanded="false" aria-controls="chat-panel">${icon('chat')} Ask us</button>
      <a class="fab call" href="tel:${esc(tel)}" aria-label="Call us any time on ${esc(b.phone)}">${icon('phone')} Call us 24/7</a>`;
    document.body.appendChild(stack);
    buildChat(cfg, tel);
  }

  function buildChat(cfg, tel) {
    const panel = document.createElement('section');
    panel.className = 'chat-panel'; panel.id = 'chat-panel'; panel.setAttribute('aria-label', 'Chat assistant');
    panel.innerHTML = `<div class="chat-head"><span>${esc(cfg.business.name)} assistant</span><button type="button" id="chat-close" aria-label="Close chat">&times;</button></div>
      <div class="chat-log" id="chat-log" role="log" aria-live="polite"></div><div class="chat-suggest" id="chat-suggest"></div>
      <form class="chat-form" id="chat-form"><label class="sr-only" for="chat-input">Your message</label><input id="chat-input" maxlength="500" autocomplete="off" placeholder="Ask about hours, prices, booking..."><button class="btn small" type="submit">Send</button></form>`;
    document.body.appendChild(panel);
    const log = $('#chat-log'), input = $('#chat-input'), openBtn = $('#chat-open');
    const add = (text, who, handoff) => {
      const d = document.createElement('div'); d.className = `msg ${who}`; d.textContent = text; log.appendChild(d);
      if (handoff) { const h = document.createElement('div'); h.className = 'msg bot chat-handoff'; h.innerHTML = `<a class="btn small" href="tel:${esc(tel)}">${icon('phone')} Call now</a><a class="btn small ghost" href="mailto:${esc(cfg.business.email)}">${icon('mail')} Email</a>`; log.appendChild(h); }
      log.scrollTop = log.scrollHeight;
    };
    const suggest = (list) => { const box = $('#chat-suggest'); box.innerHTML = ''; (list || []).slice(0, 5).forEach((s) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = s; b.addEventListener('click', () => send(s)); box.appendChild(b); }); };
    async function send(text) {
      if (!text.trim()) return;
      add(text, 'user'); input.value = '';
      try { const r = await api('/chat', { method: 'POST', body: { message: text } }); add(r.text, 'bot', r.handoff); suggest(r.suggestions); }
      catch (e) { add(`Sorry, I could not answer that (${e.message}). Please call ${cfg.business.phone}.`, 'bot', true); }
    }
    const toggle = (open) => { panel.classList.toggle('open', open); openBtn.setAttribute('aria-expanded', String(open)); if (open) { input.focus(); if (!log.children.length) { add(`Hi! I can help with working hours, fleet, prices, GearPilot drivers, booking and policies. What would you like to know?`, 'bot'); suggest(['Working Hours', 'What cars do you have?', 'Prices', 'Book a GearPilot', 'Talk to a human']); } } };
    openBtn.addEventListener('click', () => toggle(!panel.classList.contains('open')));
    $('#chat-close').addEventListener('click', () => { toggle(false); openBtn.focus(); });
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); openBtn.focus(); } });
    $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  }

  // If a thumbnail is missing (e.g. a car added in /admin), fall back to the full-size image.
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset.full && t.src.indexOf('/thumb/') > -1) { t.src = t.dataset.full; delete t.dataset.full; }
  }, true);

  window.VR = { tint, api, getConfig, money, icon, esc, $, $$, stars, carSvg, carArt, hasPhoto, brandBadge, revealOnScroll, field, showFieldErrors, clearFieldErrors, notice, todayStr, fmtDate, socialLinks, safeUrl };

  document.addEventListener('DOMContentLoaded', async () => {
    try { buildLayout(await getConfig()); } catch (e) { console.error(e); }
    revealOnScroll();
    document.dispatchEvent(new Event('vr:ready'));
  });
})();
