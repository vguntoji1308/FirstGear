'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, addDays } = require('./helpers');

async function fixture(overrides = {}) {
  const s = await startServer(overrides);
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  const insert = s.db.prepare(`INSERT INTO bookings (ref,car_id,pickup_location_id,dropoff_location_id,
    start_date,end_date,days,price_breakdown,total,customer_name,customer_email,customer_phone,status)
    VALUES (?,?,1,1,?,?,3,'{}',1000,'Report Tester','report@example.com','1234567890',?)`);
  const rows = [
    ['UPCOMING', 1, addDays(3), addDays(6), 'confirmed'],
    ['ONGOING', 2, addDays(-1), addDays(2), 'active'],
    ['RETURN-TODAY', 1, addDays(-3), addDays(0), 'confirmed'],
    ['EXPIRED', 2, addDays(-8), addDays(-5), 'confirmed'],
    ['DONE', 1, addDays(-10), addDays(-7), 'completed'],
    ['CANCELLED', 2, addDays(4), addDays(7), 'cancelled'],
    ['EARLY-COMPLETE', 1, addDays(5), addDays(8), 'completed'],
  ];
  rows.forEach((row) => insert.run(...row));
  return { ...s, token, rows };
}

test('booking filters partition current/past and combine car, status and inclusive pickup dates', async () => {
  const s = await fixture();
  try {
    const list = async (query) => (await s.call('GET', `/api/admin/bookings?${query}`, null, s.token)).body;
    assert.equal((await s.call('GET', '/api/admin/bookings')).status, 401);
    assert.deepEqual((await list('period=current')).map((b) => b.ref).sort(), ['ONGOING', 'RETURN-TODAY', 'UPCOMING']);
    assert.deepEqual((await list('period=past')).map((b) => b.ref).sort(), ['CANCELLED', 'DONE', 'EARLY-COMPLETE', 'EXPIRED']);
    assert.equal((await list('period=all')).length, 7);
    assert.deepEqual((await list(`period=current&carId=1&from=${addDays(3)}&to=${addDays(3)}`)).map((b) => b.ref), ['UPCOMING']);
    assert.deepEqual((await list('period=past&status=cancelled')).map((b) => b.ref), ['CANCELLED']);
    for (const query of ['period=invalid', 'status=invalid', 'carId=-1', 'from=2026-02-30', 'to=bad', 'from=2026-10-20&to=2026-10-19']) {
      assert.equal((await s.call('GET', `/api/admin/bookings?${query}`, null, s.token)).status, 400, query);
      assert.equal((await s.call('GET', `/api/admin/bookings/trends?${query}`, null, s.token)).status, 400, query);
    }
  } finally { s.close(); }
});

test('booking trends aggregate all filtered records, exclude cancellations and rank individual cars', async () => {
  const s = await fixture();
  try {
    assert.equal((await s.call('GET', '/api/admin/bookings/trends')).status, 401);
    const report = (await s.call('GET', '/api/admin/bookings/trends', null, s.token)).body;
    assert.equal(report.total, 7);
    assert.equal(report.booked, 6);
    assert.equal(report.cancelled, 1);
    assert.equal(report.sample, false);
    assert.equal(report.months.reduce((sum, m) => sum + m.count, 0), 6);
    assert.deepEqual(report.cars.map((c) => [c.carId, c.count]), [[1, 4], [2, 2]]);
    const filtered = (await s.call('GET', `/api/admin/bookings/trends?carId=1&from=${addDays(3)}&to=${addDays(3)}`, null, s.token)).body;
    assert.equal(filtered.booked, 1);
    assert.deepEqual(filtered.months, [{ month: addDays(3).slice(0, 7), count: 1 }]);
    const current = (await s.call('GET', '/api/admin/bookings/trends?period=current', null, s.token)).body;
    assert.equal(current.booked, 3);
    const empty = (await s.call('GET', '/api/admin/bookings/trends?carId=999999', null, s.token)).body;
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.months, []);
    assert.deepEqual(empty.cars, []);
    // The list is capped at 500, but dashboard totals must never silently use that cap.
    s.db.exec(`INSERT INTO bookings (ref,car_id,pickup_location_id,dropoff_location_id,start_date,end_date,days,
      price_breakdown,total,customer_name,customer_email,customer_phone,status)
      WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<501)
      SELECT 'BULK-'||x,1,1,1,'2026-01-01','2026-01-04',3,'{}',1000,'Tester','test@example.com','1234567890','completed' FROM n`);
    const full = (await s.call('GET', '/api/admin/bookings/trends', null, s.token)).body;
    assert.equal(full.total, 508);
    assert.equal(full.booked, 507);
  } finally { s.close(); }
});

test('sample dashboard is read-only, deterministic and Dev-only, including when requested directly', async () => {
  for (const [appEnv, isProd] of [['dev', false], ['prod', true], ['test', false], ['dev', true]]) {
    const s = await fixture({ appEnv, isProd });
    try {
      const before = s.db.prepare('SELECT * FROM bookings ORDER BY id').all();
      const response = await s.call('GET', '/api/admin/bookings/trends?dataset=sample', null, s.token);
      if (appEnv === 'dev' && !isProd) {
        assert.equal(response.status, 200);
        assert.equal(response.body.sample, true);
        assert.equal(response.body.months.length, 12);
        assert.ok(response.body.booked > 100);
        assert.equal(response.body.cars.length, 5);
        assert.deepEqual((await s.call('GET', '/api/admin/bookings/trends?dataset=sample', null, s.token)).body, response.body);
        const oneCar = (await s.call('GET', '/api/admin/bookings/trends?dataset=sample&carId=1', null, s.token)).body;
        assert.equal(oneCar.cars.length, 1);
        const year = new Date().getUTCFullYear();
        const january = (await s.call('GET', `/api/admin/bookings/trends?dataset=sample&from=${year}-01-01&to=${year}-01-31`, null, s.token)).body;
        assert.deepEqual(january.months.map((m) => m.month), [`${year}-01`]);
      } else assert.equal(response.status, 404);
      assert.deepEqual(s.db.prepare('SELECT * FROM bookings ORDER BY id').all(), before);
      assert.equal((await s.call('GET', '/api/admin/bookings/trends?dataset=unknown', null, s.token)).status, 400);
    } finally { s.close(); }
  }
});
