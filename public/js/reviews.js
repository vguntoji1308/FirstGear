'use strict';
(function () {
  const { api, $, $$, notice, safeUrl, revealOnScroll } = window.VR;
  let all = [], filter = 0, source = 'google';

  function renderList() {
    const items = filter ? all.filter((r) => r.rating === filter) : all;
    $('#rv-list').innerHTML = items.length
      ? items.map((r, i) => window.VRReviews.card(r, { moveToTop: true, delay: i })).join('')
      : '<p class="muted">No reviews with that rating yet.</p>';
    revealOnScroll();
    $$('#rv-summary [data-star]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.star === filter)));
  }

  function renderSummary(s) {
    const bars = [5, 4, 3, 2, 1].map((n) => {
      const pct = s.count ? Math.round((s.distribution[n] / s.count) * 100) : 0;
      return `<button type="button" class="rv-bar" data-star="${n}" aria-pressed="false" aria-label="Show ${n} star reviews (${s.distribution[n]})">
        <span>${n}&#9733;</span><span class="rv-track"><span class="rv-fill rv-f${n}" data-pct="${pct}"></span></span><span class="rv-n">${s.distribution[n]}</span></button>`;
    }).join('');
    $('#rv-summary').innerHTML = `<div class="rv-big"><b>${s.average ?? '-'}</b>${window.VRReviews.starRow(Math.round(s.average || 0))}<div class="muted">${s.count} review${s.count === 1 ? '' : 's'}</div>
      <button class="btn ghost small" type="button" data-star="0">Show all</button></div><div class="rv-bars">${bars}</div>`;
    // widths are applied via CSSOM (strict CSP forbids inline style attributes)
    $$('#rv-summary .rv-fill').forEach((el) => { el.style.width = `${el.dataset.pct}%`; });
  }

  async function refresh() {
    const button = $('#rv-refresh');
    button.disabled = true;
    $('#rv-error').textContent = '';
    try {
      const data = await api(source === 'google' ? '/google-reviews' : '/reviews');
      all = data.items;
      renderSummary(data.summary);
      $('#rv-note').textContent = '';
      if (source === 'google') notice($('#rv-note'), 'info', `Google Maps reviews: up to five reviews supplied by Google, sorted highest rating first. Rating bars cover these displayed reviews only.${data.listingRating != null ? ` Google listing: ${data.listingRating}/5 from ${data.listingCount ?? '?'} ratings.` : ''}`);
      if (data.summary.demo) notice($('#rv-note'), 'info', 'These are sample reviews. Real reviews replace them once added.');
      if (data.devPreview) notice($('#rv-note'), 'info', 'Dev preview includes consented feedback pending approval, including in the rating summary. PROD shows only approved feedback.');
      $('#google-link').href = safeUrl(data.googleUrl);
      renderList();
    } catch (err) {
      all = []; renderList(); $('#rv-summary').textContent = ''; $('#rv-note').textContent = '';
      notice($('#rv-error'), 'error', `Could not refresh reviews: ${err.message}`);
    }
    finally { button.disabled = false; }
  }

  document.addEventListener('vr:ready', async () => {
    const cfg = await window.VR.getConfig();
    $('#google-rate-link').href = safeUrl(cfg.business.googleRatingUrl);
    $('#rv-refresh').addEventListener('click', refresh);
    document.querySelectorAll('[data-source]').forEach((button) => button.addEventListener('click', async () => {
      if ($('#rv-refresh').disabled) return;
      source = source === 'google' ? 'website' : 'google'; filter = 0;
      button.setAttribute('aria-pressed', String(source === 'website'));
      button.textContent = source === 'website' ? 'Back to Google review list' : 'Website feedback & imported reviews';
      await refresh();
    }));
    await refresh();
    document.addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) { filter = +star.dataset.star; renderList(); return; }
      if (e.target.closest('[data-top]')) {
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        const h = $('#top h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      }
    });
  });
})();
