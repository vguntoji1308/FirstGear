'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, addDays, bookingPayload, config } = require('./helpers');

const MVP = { features: { onlineBooking: false } };

async function login(s) {
  const res = await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' });
  return res.body.token;
}

test('MVP: online booking, quotes and customer accounts are switched off', async () => {
  const s = await startServer(MVP);
  try {
    assert.equal((await s.call('GET', '/api/config')).body.features.onlineBooking, false);
    assert.equal((await s.call('POST', '/api/quote', bookingPayload())).status, 404);
    assert.equal((await s.call('POST', '/api/bookings', bookingPayload())).status, 404);
    assert.equal((await s.call('GET', '/api/bookings/lookup?ref=X&email=a@b.co')).status, 404);
    assert.equal((await s.call('GET', '/api/availability/driver')).status, 404);
    assert.equal((await s.call('POST', '/api/customer/otp/request', { phone: '+919876543210' })).status, 404);
    assert.equal((await s.call('GET', '/api/cars')).status, 200, 'fleet browsing stays public');
  } finally { s.close(); }
});

test('dynamic availability depends on the stay duration', async () => {
  const s = await startServer(MVP);
  try {
    const token = await login(s);
    const booked = await s.call('POST', '/api/admin/bookings', { carId: 1, start: addDays(5), end: addDays(8), customerName: 'Walk In', customerPhone: '+91 98765 43210' }, token);
    assert.equal(booked.status, 201);
    const free = (days, start = addDays(2)) => s.call('GET', `/api/availability?start=${start}&days=${days}`).then((r) => r.body.cars.find((c) => c.id === 1).available);
    assert.equal(await free(3), true, 'a 3-day stay ends before the booking starts');
    assert.equal(await free(4), false, 'a 4-day stay overlaps the booking');
    assert.equal(await free(1, addDays(8)), true, 'return day is free for the next customer');
    const list = await s.call('GET', `/api/cars?start=${addDays(2)}&days=4&availableOnly=true`);
    assert.ok(!list.body.some((c) => c.id === 1));
    assert.equal((await s.call('GET', '/api/availability?start=bad&days=2')).status, 400);
    assert.equal((await s.call('GET', `/api/availability?start=${addDays(2)}&days=0`)).status, 400);
  } finally { s.close(); }
});

test('admin: manual booking updates inventory and history, and rejects overlaps', async () => {
  const s = await startServer(MVP);
  try {
    const token = await login(s);
    const body = { carId: 2, start: addDays(0), end: addDays(2), customerName: 'Walk In', customerPhone: '+91 98765 43210' };
    assert.equal((await s.call('POST', '/api/admin/bookings', body)).status, 401);
    assert.equal((await s.call('POST', '/api/admin/bookings', { ...body, customerPhone: 'x' }, token)).status, 400);
    const before = (await s.call('GET', '/api/admin/inventory', null, token)).body;
    assert.equal((await s.call('POST', '/api/admin/bookings', body, token)).status, 201);
    assert.equal((await s.call('POST', '/api/admin/bookings', { ...body, start: addDays(1), end: addDays(3) }, token)).status, 409);
    const after = (await s.call('GET', '/api/admin/inventory', null, token)).body;
    assert.equal(after.available, before.available - 1);
    assert.equal(after.onRent, before.onRent + 1);
    assert.equal(after.cars.find((c) => c.id === 2).status, 'on-rent');
    assert.equal((await s.call('GET', `/api/admin/inventory?date=${addDays(10)}`, null, token)).body.cars.find((c) => c.id === 2).status, 'available');

    await s.call('POST', '/api/admin/bookings', { ...body, carId: 3, start: addDays(4), end: addDays(6) }, token);
    const cars = async (period) => (await s.call('GET', `/api/admin/bookings?period=${period}`, null, token)).body.map((b) => b.car_id).sort();
    assert.deepEqual(await cars('ongoing'), [2]);
    assert.deepEqual(await cars('upcoming'), [3]);
    const row = (await s.call('GET', '/api/admin/bookings', null, token)).body.find((b) => b.car_id === 2);
    await s.call('PATCH', `/api/admin/bookings/${row.id}`, { status: 'cancelled' }, token);
    assert.equal((await s.call('GET', '/api/admin/inventory', null, token)).body.cars.find((c) => c.id === 2).status, 'available', 'cancelling frees the car');
    assert.deepEqual(await cars('past'), [2]);
  } finally { s.close(); }
});

test('admin: price per day is configurable and car details are stored with compliance flags', async () => {
  const s = await startServer(MVP);
  try {
    const token = await login(s);
    assert.equal((await s.call('PATCH', '/api/admin/cars/1/price', { pricePerDay: 2500 })).status, 401);
    assert.equal((await s.call('PATCH', '/api/admin/cars/1/price', { pricePerDay: 0 }, token)).status, 400);
    assert.equal((await s.call('PATCH', '/api/admin/cars/999/price', { pricePerDay: 10 }, token)).status, 404);
    assert.equal((await s.call('PATCH', '/api/admin/cars/1/price', { pricePerDay: 2500 }, token)).status, 200);
    assert.equal((await s.call('GET', '/api/cars/1')).body.pricePerDay, 2500, 'customers see the new price');

    const car = (await s.call('GET', '/api/admin/cars', null, token)).body.find((c) => c.id === 1);
    const put = await s.call('PUT', '/api/admin/cars/1', {
      brand: car.brand, make: car.make, model: car.model, year: car.year, category: car.category, body: car.body, color: car.color, transmission: car.transmission,
      fuel: car.fuel, seats: car.seats, bags: car.bags, pricePerDay: 2500, deposit: car.deposit, odometerKm: 42000,
      maintenanceDue: addDays(-3), insuranceExpiry: addDays(15), pollutionExpiry: addDays(200),
    }, token);
    assert.equal(put.status, 200);
    const row = (await s.call('GET', '/api/admin/inventory', null, token)).body.cars.find((c) => c.id === 1);
    assert.equal(row.odometerKm, 42000);
    assert.equal(row.maintenanceFlag, 'overdue');
    assert.equal(row.insuranceFlag, 'due-soon');
    assert.equal(row.pollutionFlag, 'ok');
    assert.equal(row.ageYears, 0);
    assert.equal((await s.call('GET', '/api/cars/1')).body.odometerKm, undefined, 'internal car details are never public');
  } finally { s.close(); }
});

test('PORTAL splits the customer site from the admin portal', async () => {
  const customer = await startServer({ ...MVP, portal: 'customer' });
  const admin = await startServer({ ...MVP, portal: 'admin' });
  try {
    assert.equal((await customer.call('GET', '/admin')).status, 404);
    assert.equal((await customer.call('POST', '/api/auth/login', { email: 'a@b.co', password: 'x' })).status, 404);
    assert.equal((await customer.call('GET', '/')).status, 200);
    assert.equal((await admin.call('GET', '/admin')).status, 200);
    assert.equal((await admin.call('GET', '/fleet')).status, 404, 'customer pages are not served by the admin portal');
    assert.equal((await admin.call('GET', '/css/styles.css')).status, 200, 'shared assets still are');
    assert.equal((await admin.call('POST', '/api/chat', { message: 'hi' })).status, 404);
    assert.equal((await admin.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).status, 200);
  } finally { customer.close(); admin.close(); }
});

test('config defaults: both portals served', () => {
  assert.equal(config.portal, 'all');
});
