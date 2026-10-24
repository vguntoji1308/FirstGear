'use strict';
// Fetches the business's Google reviews through Google's official Places API and maps them to our review format.
//   api = 'new'    Places API (New): GET /v1/places/{id}. Returns up to 5 reviews (Google's "most relevant" order).
//   api = 'legacy' Places API (Legacy) Place Details with reviews_sort=newest. Returns the 5 newest reviews.
//                  (Google no longer enables the legacy API for new projects; use it only if your project already has it.)
// Nothing here logs or returns the API key.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanRow({ author, rating, text, date, url }) {
  const r = Number(rating);
  if (!author || !Number.isInteger(r) || r < 1 || r > 5 || !DATE.test(date || '')) return null;
  return {
    author: String(author).trim().slice(0, 80),
    rating: r,
    text: String(text || '').trim().slice(0, 2000),
    date,
    url: /^https:[/][/]/i.test(url || '') ? String(url).slice(0, 300) : null,
  };
}

function mapNew(json) {
  const rows = (json.reviews || []).map((r) => cleanRow({
    author: r.authorAttribution && r.authorAttribution.displayName,
    rating: r.rating,
    text: (r.originalText && r.originalText.text) || (r.text && r.text.text),
    date: String(r.publishTime || '').slice(0, 10),
    url: r.googleMapsUri,
  })).filter(Boolean);
  return { rows, rating: json.rating ?? null, total: json.userRatingCount ?? null, mapsUrl: json.googleMapsUri || null };
}

function mapLegacy(json) {
  const res = json.result || {};
  const rows = (res.reviews || []).map((r) => cleanRow({
    author: r.author_name,
    rating: r.rating,
    text: r.text,
    date: Number.isFinite(r.time) ? new Date(r.time * 1000).toISOString().slice(0, 10) : '',
    url: r.author_url,
  })).filter(Boolean);
  return { rows, rating: res.rating ?? null, total: res.user_ratings_total ?? null, mapsUrl: res.url || null };
}

async function fetchGoogleReviews({ apiKey, placeId, api = 'new', baseUrl = 'https://places.googleapis.com', legacyBaseUrl = 'https://maps.googleapis.com', fetchImpl = fetch }) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set.');
  if (!placeId) throw new Error('GOOGLE_PLACE_ID is not set.');
  let url, init;
  if (api === 'legacy') {
    const q = new URLSearchParams({ place_id: placeId, fields: 'rating,user_ratings_total,url,reviews', reviews_sort: 'newest', key: apiKey });
    url = `${legacyBaseUrl}/maps/api/place/details/json?${q}`;
    init = {};
  } else {
    url = `${baseUrl}/v1/places/${encodeURIComponent(placeId)}?languageCode=en`;
    // the key goes in a header (not the URL) so it cannot end up in logs or proxies' access lines
    init = { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews' } };
  }
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (api === 'legacy') {
    if (body.status && body.status !== 'OK') throw new Error(`Google Places (legacy) returned ${body.status}${body.error_message ? ': ' + body.error_message : ''}`);
    return mapLegacy(body);
  }
  if (!res.ok) {
    const e = body.error || {};
    throw new Error(`Google Places returned ${res.status}${e.status ? ' ' + e.status : ''}${e.message ? ': ' + e.message : ''}`);
  }
  return mapNew(body);
}

module.exports = { fetchGoogleReviews, mapNew, mapLegacy };
