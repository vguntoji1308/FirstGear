'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { fetchGoogleReviews } = require('../src/services/google-places');
const { openDb } = require('../src/db');
const { importReviews, listReviews } = require('../src/services/reviews');

const KEY = 'AIzaSy-test-key-should-never-leak';
let server, base, seen = [], mode = 'ok';

const NEW_BODY = {
  rating: 4.8, userRatingCount: 120, googleMapsUri: 'https://maps.google.com/?cid=123',
  reviews: [
    { rating: 5, publishTime: '2026-10-20T08:15:00.123456Z', authorAttribution: { displayName: 'Arun K' }, text: { text: 'Translated: great service' }, originalText: { text: 'Great service, polite staff' }, googleMapsUri: 'https://maps.google.com/?review=1' },
    { rating: 4, publishTime: '2026-10-18T10:00:00Z', authorAttribution: { displayName: 'Meena T' }, text: { text: 'Good value for money' } },
    { rating: 5, publishTime: '2026-10-17T10:00:00Z', authorAttribution: { displayName: 'No Text Person' } },
    { rating: 9, publishTime: '2026-10-16T10:00:00Z', authorAttribution: { displayName: 'Bad Rating' }, text: { text: 'x' } },
    { rating: 5, publishTime: 'not-a-date', authorAttribution: { displayName: 'Bad Date' }, text: { text: 'x' } },
  ],
};

before(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'denied') { res.statusCode = 403; return res.end(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API key not valid for this API.' } })); }
    if (req.url.startsWith('/maps/api/place/details/json')) {
      if (mode === 'legacy-denied') return res.end(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'You must enable Billing' }));
      return res.end(JSON.stringify({ status: 'OK', result: { rating: 4.5, user_ratings_total: 10, url: 'https://maps.google.com/?cid=9', reviews: [
        { author_name: 'Legacy Lee', rating: 5, text: 'Spotless car', time: 1760950000, author_url: 'https://www.google.com/maps/contrib/1' }] } }));
    }
    return res.end(JSON.stringify(NEW_BODY));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('new API: key goes in a header, field mask requested, reviews mapped and invalid rows dropped', async () => {
  seen = []; mode = 'ok';
  const out = await fetchGoogleReviews({ apiKey: KEY, placeId: 'ChIJ_test place', baseUrl: base });
  assert.equal(seen[0].url, '/v1/places/ChIJ_test%20place?languageCode=en');
  assert.equal(seen[0].headers['x-goog-api-key'], KEY);
  assert.match(seen[0].headers['x-goog-fieldmask'], /reviews/);
  assert.ok(!seen[0].url.includes(KEY), 'key must not appear in the URL');
  assert.equal(out.rows.length, 3, 'bad rating and bad date rows are dropped');
  assert.deepEqual(out.rows[0], { author: 'Arun K', rating: 5, text: 'Great service, polite staff', date: '2026-10-20', url: 'https://maps.google.com/?review=1' });
  assert.equal(out.rows[1].text, 'Good value for money');
  assert.equal(out.rows[2].text, '');
  assert.equal(out.total, 120);
  assert.equal(out.mapsUrl, 'https://maps.google.com/?cid=123');
});

test('legacy API requests the newest reviews', async () => {
  seen = []; mode = 'ok';
  const out = await fetchGoogleReviews({ apiKey: KEY, placeId: 'PID', api: 'legacy', legacyBaseUrl: base });
  assert.match(seen[0].url, /reviews_sort=newest/);
  assert.equal(out.rows[0].author, 'Legacy Lee');
  assert.match(out.rows[0].date, /^2025-10-\d\d$/);
  mode = 'legacy-denied';
  await assert.rejects(fetchGoogleReviews({ apiKey: KEY, placeId: 'PID', api: 'legacy', legacyBaseUrl: base }), /REQUEST_DENIED/);
});

test('errors are readable and never contain the API key; missing config is reported', async () => {
  mode = 'denied';
  await assert.rejects(fetchGoogleReviews({ apiKey: KEY, placeId: 'PID', baseUrl: base }), (e) => /403 PERMISSION_DENIED/.test(e.message) && !e.message.includes(KEY));
  await assert.rejects(fetchGoogleReviews({ placeId: 'PID', baseUrl: base }), /GOOGLE_PLACES_API_KEY/);
  await assert.rejects(fetchGoogleReviews({ apiKey: KEY, baseUrl: base }), /GOOGLE_PLACE_ID/);
  mode = 'ok';
});

test('imported Google reviews are deduplicated across repeated syncs and replace demo reviews', async () => {
  mode = 'ok';
  const db = openDb(':memory:');
  const { rows } = await fetchGoogleReviews({ apiKey: KEY, placeId: 'PID', baseUrl: base });
  assert.deepEqual(importReviews(db, rows), { added: 3, skippedDuplicates: 0 });
  assert.deepEqual(importReviews(db, rows), { added: 0, skippedDuplicates: 3 });
  const list = listReviews(db, { limit: 5 });
  assert.equal(list.summary.count, 3);
  assert.equal(list.items[0].author, 'Arun K');
  db.close();
});

test('CLI: --dry-run writes nothing, a real run imports, a second run skips duplicates, key never printed', async () => {
  mode = 'ok';
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fg-sync-')), 'sync.sqlite');
  // async spawn: the mock Google server lives in this process, so we must not block its event loop
  const exec = (env, extra) => new Promise((resolve) => {
    const p = spawn(process.execPath, ['scripts/sync-google-reviews.js', ...extra], { cwd: path.resolve(__dirname, '..'), env: { PATH: process.env.PATH, APP_ENV: 'test', DB_PATH: dbFile, ...env } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  const full = { GOOGLE_PLACES_API_KEY: KEY, GOOGLE_PLACE_ID: 'PID', GOOGLE_PLACES_BASE_URL: base };
  const run = (...extra) => exec(full, extra);
  const dry = await run('--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run: nothing written/);
  const first = await run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Imported 3 new review\(s\); skipped 0/);
  const second = await run();
  assert.match(second.stdout, /Imported 0 new review\(s\); skipped 3/);
  for (const r of [dry, first, second]) assert.ok(!(r.stdout + r.stderr).includes(KEY), 'API key must never be printed');
  const bad = await exec({}, []);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /GOOGLE_PLACES_API_KEY is not set/);
});
