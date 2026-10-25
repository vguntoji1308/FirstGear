'use strict';
/* Shared review rendering: coloured cards, supporting-word highlighting, rating summary. Needs common.js (window.VR). */
(function () {
  const { esc } = window.VR;

  // Words worth highlighting in a review, grouped by what they support. Longer phrases are matched first.
  const LEXICON = {
    pos: ['excellent', 'great', 'good', 'best', 'amazing', 'awesome', 'superb', 'perfect', 'wonderful', 'smooth', 'comfortable', 'spotless', 'clean', 'neat',
      'well maintained', 'well-maintained', 'well kept', 'well-kept', 'highly recommended', 'recommended', 'recommend', 'happy', 'satisfied', 'loved', 'love', 'nice',
      'fantastic', 'outstanding', 'brilliant', 'top-notch', 'top notch', 'trustworthy', 'reliable'],
    svc: ['polite', 'friendly', 'helpful', 'professional', 'supportive', 'responsive', 'prompt', 'punctual', 'on time', 'on-time', 'hassle-free', 'hassle free', 'courteous',
      'cooperative', 'trusted', 'honest', 'answered every call', 'quick', 'staff', 'team', 'service', 'delivery', 'support'],
    price: ['value for money', 'affordable', 'reasonable', 'cheap', 'cost-effective', 'cost effective', 'fair daily rates', 'fair', 'transparent', 'no hidden charges', 'no hidden',
      'no surprises', 'best price', 'low price', 'pricing', 'rates'],
    car: ['great condition', 'good condition', 'condition', 'mileage', 'fuel efficient', 'spacious', 'brand new', 'new car', 'wide choice', 'variety', 'ac'],
  };
  const CAT = {};
  const phrases = [];
  Object.entries(LEXICON).forEach(([cat, list]) => list.forEach((p) => { if (!CAT[p]) { CAT[p] = cat; phrases.push(p); } }));
  phrases.sort((a, b) => b.length - a.length);
  // (^|non-word) + phrase + (end|non-word): a simple word boundary that also works for phrases containing hyphens/spaces
  const HL_RE = new RegExp('(^|[^a-z0-9-])(' + phrases.join('|') + ')(?=$|[^a-z0-9-])', 'gi');

  function highlight(text) {
    return esc(text).replace(HL_RE, (_m, pre, word) => `${pre}<mark class="hl hl-${CAT[word.toLowerCase()]}">${word}</mark>`);
  }

  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const starRow = (n) => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) =>
    `<svg class="${i <= n ? '' : 'off'}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.500 2.900 6 6.600.9-4.800 4.600 1.200 6.500L12 17.300l-5.900 3.200 1.200-6.500L2.500 9.400l6.600-.9z"/></svg>`).join('')}</span>`;
  const fmt = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const sourceBadge = (s) => (s === 'google' ? '<span class="src src-google">Google review</span>' : '<span class="src">Customer feedback</span>');

  function card(r, { moveToTop = false, delay = 0 } = {}) {
    const c = delay % 6;
    return `<article class="rv-card rv-c${c} reveal" data-delay="${delay % 3}" data-rating="${r.rating}">
      <header class="rv-head"><span class="avatar rv-av">${esc((r.author || '?')[0]).toUpperCase()}</span>
        <div class="rv-who"><strong>${esc(r.author)}</strong><small>${esc(fmt(r.date))} ${sourceBadge(r.source)}${r.pendingApproval ? ' <span class="src">Pending approval (Dev only)</span>' : ''}</small></div>${starRow(r.rating)}</header>
      <p class="rv-text">${r.text ? (r.source === 'google' ? esc(r.text) : highlight(r.text)) : '<span class="muted">Rated this business without writing a review.</span>'}</p>
      ${r.source === 'google' && r.url ? `<a href="${esc(window.VR.safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">View on Google Maps</a>` : ''}
      ${moveToTop ? '<div class="rv-actions"><button class="rv-top" type="button" data-top aria-label="Move to top of the reviews page">&uarr; Move to top</button></div>' : ''}
    </article>`;
  }

  function summaryHtml(s) {
    if (!s.count) return '';
    return `<b>${s.average}</b><div>${starRow(Math.round(s.average))}<div class="muted">${s.count} review${s.count === 1 ? '' : 's'}</div></div>`;
  }

  window.VRReviews = { highlight, card, starRow, summaryHtml, fmt };
})();
