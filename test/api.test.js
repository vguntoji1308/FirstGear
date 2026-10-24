'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, addDays, bookingPayload } = require('./helpers');
const { shiftYears, todayIso } = require('../src/validate');

let s;
before(async () => { s = await startServer(); });
after(() => s.close());

test('health and config expose the click-to-call number and socials', async () => {
  assert.equal((await s.call('GET', '/api/health')).body.status, 'ok');
  const { body } = await s.call('GET', '/api/config');
  assert.ok(body.business.phone);
  assert.ok(body.business.social.instagram);
  assert.equal(body.business.social.facebook, 'https://www.facebook.com/myfirstgear');
  assert.equal(body.business.social.instagram, 'https://www.instagram.com/myfirstgear/');
  assert.equal(body.business.social.x, 'https://x.com/myfirstgear');
  assert.equal(body.business.social.youtube, 'https://www.youtube.com/@myfirstgear');
  assert.equal(Object.hasOwn(body.business.social, 'linkedin'), false);
  assert.equal(JSON.stringify(body).includes('secret'), false);
});

test('fleet filters work', async () => {
  const all = (await s.call('GET', '/api/cars')).body;
  assert.equal(all.length, 34);
  const evs = (await s.call('GET', '/api/cars?fuel=electric')).body;
  assert.deepEqual(evs.map((c) => c.model), ['Nexon EV']);
  const cheap = (await s.call('GET', '/api/cars?maxPrice=2500&sort=price_asc')).body;
  assert.ok(cheap.length > 0 && cheap.every((c) => c.pricePerDay <= 2500));
  const seven = (await s.call('GET', '/api/cars?seats=7')).body;
  assert.ok(seven.every((c) => c.seats >= 7));
  assert.ok(all.find((c) => c.model === 'Baleno AMT').rating.count >= 2);
  const mahindra = (await s.call('GET', '/api/cars?brand=mahindra')).body;
  assert.deepEqual(mahindra.map((c) => c.model).sort(), ['Scorpio N', 'Thar', 'Thar Roxx', 'Thar Roxx Black', 'XUV300 AMT', 'XUV700']);
  assert.ok(mahindra.every((c) => c.brand === 'mahindra' && c.make === 'Mahindra'));
  assert.ok(all.every((c) => c.image === null || c.image.startsWith('/img/cars/')));
  assert.equal(all.filter((c) => c.image).length, 34, 'every car has a photo');
  assert.ok(all.every((c) => c.image.endsWith('.webp')));
  const cng = (await s.call('GET', '/api/cars?fuel=cng')).body;
  assert.equal(cng.length, 2);
});

test('quote prices add-ons, chauffeur, discount and young-driver fee', async () => {
  const q = (await s.call('POST', '/api/quote', { carId: 2, pickupLocationId: 1, dropoffLocationId: 1, start: addDays(20), end: addDays(23), addons: ['insurance', 'gps'] })).body;
  // car 2 is 2500/day: 3 days x (2500 + 500 insurance + 200 GPS) = 9600, tax 5%
  assert.equal(q.subtotal, 9600);
  assert.equal(q.total, 10080);
  const ch = (await s.call('POST', '/api/quote', { carId: 2, pickupLocationId: 1, dropoffLocationId: 1, start: addDays(20), end: addDays(21), driverMode: 'chauffeur' })).body;
  assert.equal(ch.subtotal, 2500 + 1200);
  assert.equal(ch.deposit, 0);
  const week = (await s.call('POST', '/api/quote', { carId: 1, pickupLocationId: 1, dropoffLocationId: 1, start: addDays(20), end: addDays(27) })).body;
  assert.equal(week.lines.find((l) => l.code === 'discount').amount, -2450); // 7 days x 3500 x 10%
  const young = (await s.call('POST', '/api/quote', { carId: 1, pickupLocationId: 1, dropoffLocationId: 1, start: addDays(20), end: addDays(22), dateOfBirth: addDays(-365 * 22 - 10) })).body;
  assert.ok(young.lines.some((l) => l.code === 'young_driver'));
});

test('rejects bad dates, unknown add-ons and self-only add-ons with a chauffeur', async () => {
  const base = { carId: 1, pickupLocationId: 1, dropoffLocationId: 1 };
  assert.equal((await s.call('POST', '/api/quote', { ...base, start: addDays(-3), end: addDays(2) })).status, 400);
  assert.equal((await s.call('POST', '/api/quote', { ...base, start: addDays(5), end: addDays(5) })).status, 400);
  assert.equal((await s.call('POST', '/api/quote', { ...base, start: addDays(5), end: addDays(60) })).status, 400);
  assert.equal((await s.call('POST', '/api/quote', { ...base, start: addDays(5), end: addDays(6), addons: ['nope'] })).status, 400);
  assert.equal((await s.call('POST', '/api/quote', { ...base, start: addDays(5), end: addDays(6), addons: ['gps'], driverMode: 'chauffeur' })).status, 400);
});

test('booking flow: create, double-booking blocked, availability reflects it, lookup and cancel', async () => {
  const create = await s.call('POST', '/api/bookings', bookingPayload());
  assert.equal(create.status, 201);
  assert.match(create.body.ref, /^FG-[0-9A-F]{8}$/);
  assert.equal(create.body.total, 9450); // 3 x (2500 + 500) + 5% tax

  const clash = await s.call('POST', '/api/bookings', bookingPayload({ start: addDays(11), end: addDays(14) }));
  assert.equal(clash.status, 409);
  const adjacent = await s.call('POST', '/api/bookings', bookingPayload({ start: addDays(13), end: addDays(15) }));
  assert.equal(adjacent.status, 201, 'return day is free for the next rental');

  const cars = (await s.call('GET', `/api/cars?start=${addDays(10)}&end=${addDays(12)}`)).body;
  assert.equal(cars.find((c) => c.id === 2).available, false);
  assert.equal(cars.find((c) => c.id === 1).available, true);

  const ref = create.body.ref;
  assert.equal((await s.call('GET', `/api/bookings/lookup?ref=${ref}&email=wrong@example.com`)).status, 404);
  const found = await s.call('GET', `/api/bookings/lookup?ref=${ref}&email=test@example.com`);
  assert.equal(found.status, 200);
  assert.equal(found.body.customerName, 'Test Customer');
  assert.equal((await s.call('POST', '/api/bookings/cancel', { ref, email: 'test@example.com' })).body.status, 'cancelled');
  assert.equal((await s.call('POST', '/api/bookings', bookingPayload())).status, 201, 'cancelled booking frees the car');
});

test('driver age, licence expiry, terms and missing-field validation', async () => {
  const r1 = await s.call('POST', '/api/bookings', bookingPayload({ carId: 3, dateOfBirth: addDays(-365 * 19) }));
  assert.equal(r1.status, 400);
  assert.ok(r1.body.details.dateOfBirth);
  const r2 = await s.call('POST', '/api/bookings', bookingPayload({ carId: 3, licenceExpiry: addDays(11) }));
  assert.ok(r2.body.details.licenceExpiry);
  const r3 = await s.call('POST', '/api/bookings', bookingPayload({ carId: 3, acceptTerms: false }));
  assert.ok(r3.body.details.acceptTerms);
  const r4 = await s.call('POST', '/api/bookings', { carId: 3 });
  assert.equal(r4.status, 400);
  const r5 = await s.call('POST', '/api/bookings', bookingPayload({ carId: 3, customerEmail: 'not-an-email', licenceNumber: '<script>' }));
  assert.ok(r5.body.details.customerEmail && r5.body.details.licenceNumber);
});

test('DOB and licence expiry enforce inclusive 80/20 calendar-year limits from today', async () => {
  const server = await startServer();
  const beforeOrAfter = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  try {
    const minBirth = shiftYears(todayIso(), -80);
    const maxExpiry = shiftYears(todayIso(), 20);
    const config = (await server.call('GET', '/api/config')).body;
    assert.equal(config.rental.earliestDateOfBirth, minBirth);
    assert.equal(config.rental.latestLicenceExpiry, maxExpiry);
    for (const driverMode of ['self', 'chauffeur']) {
      const payload = bookingPayload({ dateOfBirth: beforeOrAfter(minBirth, -1), driverMode, addons: [] });
      const invalid = await server.call('POST', '/api/bookings', payload);
      assert.equal(invalid.status, 400);
      assert.match(invalid.body.details.dateOfBirth, /80 years/);
      assert.equal((await server.call('POST', '/api/quote', payload)).status, 400);
    }
    const lateExpiry = await server.call('POST', '/api/bookings', bookingPayload({ licenceExpiry: beforeOrAfter(maxExpiry, 1) }));
    assert.equal(lateExpiry.status, 400);
    assert.match(lateExpiry.body.details.licenceExpiry, /20 years/);
    assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
    const boundary = bookingPayload({ dateOfBirth: minBirth, licenceExpiry: maxExpiry });
    assert.equal((await server.call('POST', '/api/quote', boundary)).status, 200);
    assert.equal((await server.call('POST', '/api/bookings', boundary)).status, 201);
    assert.equal((await server.call('POST', '/api/bookings', bookingPayload({
      carId: 3, driverMode: 'chauffeur', addons: [], dateOfBirth: minBirth,
      licenceNumber: undefined, licenceCountry: undefined, licenceExpiry: undefined,
    }))).status, 201);
  } finally { server.close(); }
});

test('calendar-year offsets clamp leap-day boundaries rather than rolling into March', () => {
  assert.equal(shiftYears('2080-02-29', 20), '2100-02-28');
  assert.equal(shiftYears('1980-02-29', -80), '1900-02-28');
  assert.equal(shiftYears('2024-02-29', 20), '2044-02-29');
});

test('chauffeur booking: no licence needed, runs out of drivers, then conflicts', async () => {
  const dates = { start: addDays(40), end: addDays(42) };
  const payload = (carId) => bookingPayload({ carId, ...dates, driverMode: 'chauffeur', addons: ['child_seat'], licenceNumber: undefined, licenceCountry: undefined, licenceExpiry: undefined });
  assert.equal((await s.call('GET', `/api/availability/driver?start=${dates.start}&end=${dates.end}`)).body.driversFree, 3);
  for (const carId of [4, 5, 6]) {
    const res = await s.call('POST', '/api/bookings', payload(carId));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.chauffeur);
    assert.equal(res.body.deposit, 0);
  }
  assert.equal((await s.call('GET', `/api/availability/driver?start=${dates.start}&end=${dates.end}`)).body.available, false);
  const none = await s.call('POST', '/api/bookings', payload(7));
  assert.equal(none.status, 409);
  assert.equal((await s.call('POST', '/api/bookings', bookingPayload({ carId: 7, ...dates }))).status, 201, 'self-drive unaffected');
});

test('reviews: submit updates average; validation enforced; output is stored as plain text', async () => {
  const before = (await s.call('GET', '/api/cars/9')).body.rating;
  assert.equal(before.count, 0);
  assert.equal((await s.call('POST', '/api/cars/9/reviews', { rating: 5, author: 'A', comment: '<b>x</b>' })).status, 201);
  const res = await s.call('POST', '/api/cars/9/reviews', { rating: 2, author: 'B', comment: 'meh' });
  assert.deepEqual(res.body.rating, { average: 3.5, count: 2 });
  assert.equal((await s.call('POST', '/api/cars/9/reviews', { rating: 6, author: 'B' })).status, 400);
  assert.equal((await s.call('POST', '/api/cars/999/reviews', { rating: 5, author: 'B' })).status, 404);
});

test('feedback is hidden from testimonials until an admin approves it', async () => {
  const fb = await s.call('POST', '/api/feedback', { name: 'Zed', email: 'z@example.com', rating: 5, message: 'Superb service!', allowPublish: true });
  assert.equal(fb.status, 201);
  assert.ok(!(await s.call('GET', '/api/testimonials')).body.items.some((t) => t.name === 'Zed'));
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  const list = (await s.call('GET', '/api/admin/feedback', null, token)).body;
  const id = list.find((f) => f.name === 'Zed').id;
  await s.call('PATCH', `/api/admin/feedback/${id}`, { approved: true }, token);
  assert.ok((await s.call('GET', '/api/testimonials')).body.items.some((t) => t.name === 'Zed'));
  assert.equal((await s.call('POST', '/api/feedback', { name: 'x', email: 'bad', rating: 9, message: '' })).status, 400);
});

test('admin: authn/authz, car CRUD, booking status', async () => {
  assert.equal((await s.call('GET', '/api/admin/cars')).status, 401);
  assert.equal((await s.call('GET', '/api/admin/cars', null, 'garbage')).status, 401);
  assert.equal((await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'wrong' })).status, 401);
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  const car = { make: 'Kia', model: 'EV6', year: 2024, category: 'electric', body: 'suv', color: '#112233', transmission: 'automatic', fuel: 'electric', seats: 5, bags: 3, pricePerDay: 95, deposit: 500, brand: 'kia', image: '/img/cars/ev6.jpg', features: ['A/C'] };
  assert.equal((await s.call('POST', '/api/admin/cars', { ...car, pricePerDay: -1 }, token)).status, 400);
  const created = await s.call('POST', '/api/admin/cars', car, token);
  assert.equal(created.status, 201);
  assert.equal((await s.call('PUT', `/api/admin/cars/${created.body.id}`, { ...car, pricePerDay: 99 }, token)).status, 200);
  assert.equal((await s.call('GET', `/api/cars/${created.body.id}`)).body.pricePerDay, 99);
  await s.call('DELETE', `/api/admin/cars/${created.body.id}`, null, token);
  assert.equal((await s.call('GET', `/api/cars/${created.body.id}`)).status, 404);

  const bookings = (await s.call('GET', '/api/admin/bookings', null, token)).body;
  assert.ok(bookings.length > 0);
  assert.equal((await s.call('PATCH', `/api/admin/bookings/${bookings[0].id}`, { status: 'bogus' }, token)).status, 400);
  assert.equal((await s.call('PATCH', `/api/admin/bookings/${bookings[0].id}`, { status: 'completed' }, token)).status, 200);
  assert.ok((await s.call('GET', '/api/admin/summary', null, token)).body.cars >= 34);
  assert.equal((await s.call('POST', '/api/admin/cars', { ...car, brand: 'nope' }, token)).status, 400);
  assert.equal((await s.call('POST', '/api/admin/cars', { ...car, image: 'http://evil.example/x.png' }, token)).status, 400);
});

test('feedback preview is Dev-only, consented, private and follows approval changes', async () => {
  for (const [appEnv, isProd] of [['dev', false], ['prod', true], ['test', false], ['dev', true]]) {
    const server = await startServer({ appEnv, isProd });
    try {
      const pending = { name: 'Preview Reviewer', email: 'private@example.com', rating: 4, message: 'Friendly service and a clean car.', allowPublish: true };
      assert.equal((await server.call('POST', '/api/feedback', pending)).status, 201);
      assert.equal((await server.call('POST', '/api/feedback', { ...pending, name: 'Private Reviewer', allowPublish: false })).status, 201);
      const preview = appEnv === 'dev' && !isProd;
      const result = await server.call('GET', '/api/reviews');
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.body.devPreview, preview);
      const review = result.body.items.find((r) => r.author === pending.name);
      assert.equal(!!review, preview);
      if (preview) {
        assert.equal(review.pendingApproval, true);
        assert.equal(review.text, pending.message);
        assert.equal(result.body.summary.count, 1);
      }
      assert.ok(!JSON.stringify(result.body).includes(pending.email));
      assert.ok(!result.body.items.some((r) => r.author === 'Private Reviewer'));
      assert.ok(!(await server.call('GET', '/api/testimonials')).body.items.some((r) => r.name === pending.name));
      // A client-supplied flag must never enable the server's Dev-only preview.
      const forced = (await server.call('GET', '/api/reviews?includePending=true')).body;
      assert.equal(!!forced.items.find((r) => r.author === pending.name), preview);
      const token = (await server.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
      const entries = (await server.call('GET', '/api/admin/feedback', null, token)).body;
      const id = entries.find((r) => r.name === pending.name).id;
      assert.equal((await server.call('PATCH', `/api/admin/feedback/${id}`, { approved: true }, token)).status, 200);
      const approved = (await server.call('GET', '/api/reviews')).body.items.find((r) => r.author === pending.name);
      assert.ok(approved);
      assert.equal(approved.pendingApproval, false);
      assert.equal((await server.call('DELETE', `/api/admin/feedback/${id}`, null, token)).status, 200);
      assert.ok(!(await server.call('GET', '/api/reviews')).body.items.some((r) => r.author === pending.name));
    } finally { server.close(); }
  }
});

test('admin driver creation persists and rejects invalid or unauthenticated POSTs', async () => {
  const payload = { name: 'Test Driver', languages: 'English, Tamil', yearsExperience: 5 };
  assert.equal((await s.call('POST', '/api/admin/drivers', payload)).status, 401);
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  assert.equal((await s.call('POST', '/api/admin/drivers', { ...payload, yearsExperience: -1 }, token)).status, 400);
  const created = await s.call('POST', '/api/admin/drivers', payload, token);
  assert.equal(created.status, 201);
  assert.ok((await s.call('GET', '/api/admin/drivers', null, token)).body.some((r) => r.id === created.body.id && r.name === payload.name));
});

test('chatbot answers FAQs from live data and falls back to human contact', async () => {
  const hours = (await s.call('POST', '/api/chat', { message: 'What are your opening hours?' })).body;
  assert.match(hours.text, /Daily 08:00/);
  const fleet = (await s.call('POST', '/api/chat', { message: 'which cars do you have' })).body;
  assert.match(fleet.text, /34 cars/);
  assert.match((await s.call('POST', '/api/chat', { message: 'do you offer a chauffeur?' })).body.text, /GearPilot/);
  assert.match((await s.call('POST', '/api/chat', { message: 'tell me about GearPilot' })).body.text, /GearPilot/);
  const fb = (await s.call('POST', '/api/chat', { message: 'blorp zzz quantum' })).body;
  assert.equal(fb.handoff, true);
  assert.ok(fb.text.includes('+91 96533 13974'));
  assert.equal((await s.call('POST', '/api/chat', { message: '' })).status, 400);
});

test('security: headers, malformed JSON, no CORS by default, unknown API route', async () => {
  const res = await s.call('GET', '/api/health');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const bad = await fetch(`${s.base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.equal((await s.call('GET', '/api/nope')).status, 404);
});

test('rate limiting returns 429 after the configured maximum', async () => {
  const lim = await startServer({ rateLimit: { max: 5, writeMax: 1000, loginMax: 3 } });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await lim.call('POST', '/api/auth/login', { email: 'a@b.co', password: 'x' })).status);
    assert.deepEqual(codes, [401, 401, 401, 429]);
  } finally { lim.close(); }
});

test('reviews: newest first, limit works, admin import is protected, validated and deduplicated; real reviews replace demo ones', async () => {
  const s = await startServer(); // fresh server: other tests approve real feedback, which would hide the demo reviews
  const demo = (await s.call('GET', '/api/reviews')).body;
  assert.ok(demo.summary.demo, 'seeded demo reviews are flagged');
  assert.ok(demo.items.length >= 8);
  const dates = demo.items.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'sorted newest first');
  const top5 = (await s.call('GET', '/api/reviews?limit=5')).body;
  assert.equal(top5.items.length, 5);
  assert.equal(top5.summary.count, demo.summary.count, 'summary covers all reviews, not just the page');
  assert.equal((await s.call('GET', '/api/reviews?limit=0')).status, 400);
  assert.ok((await s.call('GET', '/api/reviews')).body.googleUrl.startsWith('https://'));

  const payload = { reviews: [
    { author: 'Real Customer', rating: 5, text: 'Polite staff and a spotless car <b>x</b>', date: '2026-10-20' },
    { author: 'Another One', rating: 4, text: 'Good value for money', date: '2026-10-22' },
  ] };
  assert.equal((await s.call('POST', '/api/admin/reviews/import', payload)).status, 401);
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  assert.equal((await s.call('POST', '/api/admin/reviews/import', { reviews: [{ author: 'x', rating: 9 }] }, token)).status, 400);
  assert.equal((await s.call('POST', '/api/admin/reviews/import', { reviews: [] }, token)).status, 400);
  assert.equal((await s.call('POST', '/api/admin/reviews/import', { reviews: [{ author: 'x', rating: 5, url: 'javascript:alert(1)' }] }, token)).status, 400);

  const first = await s.call('POST', '/api/admin/reviews/import', payload, token);
  assert.deepEqual(first.body, { added: 2, skippedDuplicates: 0 });
  assert.deepEqual((await s.call('POST', '/api/admin/reviews/import', payload, token)).body, { added: 0, skippedDuplicates: 2 });

  const real = (await s.call('GET', '/api/reviews')).body;
  assert.equal(real.summary.demo, false);
  assert.ok(real.items.every((r) => r.source === 'google'), 'demo reviews are hidden once real ones exist');
  assert.equal(real.summary.count, 2);
  assert.equal(real.summary.average, 4.5);
  assert.equal(real.items[0].author, 'Another One', 'newest first');
  assert.equal((await s.call('POST', '/api/admin/reviews/import', { reviews: [{ author: 'Solo', rating: 3, date: '2026-10-23' }], replace: true }, token)).body.added, 1);
  assert.equal((await s.call('GET', '/api/reviews')).body.summary.count, 1);
  s.close();
});
