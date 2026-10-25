'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

test('live Google reviews are sorted rating descending, attributed and never persisted', async () => {
  const s = await startServer({ googlePlaces: { apiKey: 'private-key', placeId: 'place' } }, {
    googleFetch: async () => new Response(JSON.stringify({
      rating: 4.7, userRatingCount: 100, googleMapsUri: 'https://maps.google.com/',
      reviews: [2, 5, 4].map((rating) => ({ rating, authorAttribution: { displayName: `Customer ${rating}`, uri: 'https://maps.google.com/contrib/test' },
        originalText: { text: 'Great service' }, publishTime: '2026-10-25T10:00:00Z' })),
    })),
  });
  try {
    const before = s.db.prepare('SELECT COUNT(*) AS count FROM customer_reviews').get().count;
    const response = await s.call('GET', '/api/google-reviews');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(response.body.items.map((r) => r.rating), [5, 4, 2]);
    assert.equal(response.body.summary.count, 3);
    assert.equal(response.body.listingCount, 100);
    assert.ok(response.body.items.every((r) => r.url && r.source === 'google'));
    assert.ok(!JSON.stringify(response.body).includes('private-key'));
    assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM customer_reviews').get().count, before);
  } finally { s.close(); }
});

test('missing credentials and provider failures are explicit, without sample-review fallback', async () => {
  const s = await startServer({ googlePlaces: { apiKey: '', placeId: '' } });
  try { assert.equal((await s.call('GET', '/api/google-reviews')).status, 503); }
  finally { s.close(); }
  const failed = await startServer({ googlePlaces: { apiKey: 'secret', placeId: 'place' } }, {
    googleFetch: async () => new Response(JSON.stringify({ error: { message: 'secret', status: 'PERMISSION_DENIED' } }), { status: 403 }),
  });
  try {
    const response = await failed.call('GET', '/api/google-reviews');
    assert.equal(response.status, 502);
    assert.ok(!JSON.stringify(response.body).includes('secret'));
  } finally { failed.close(); }
});
