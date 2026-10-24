'use strict';
process.env.APP_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Test-Admin-Pass-123';
process.env.JWT_SECRET = 'x'.repeat(40) + 'unit-test-secret';
process.env.RATE_LIMIT_WRITE_MAX = '1000';
process.env.RATE_LIMIT_LOGIN_MAX = '1000';

const config = require('../src/config');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');

async function startServer(overrides = {}) {
  const cfg = { ...config, ...overrides, rateLimit: { ...config.rateLimit, ...(overrides.rateLimit || {}) } };
  const db = openDb(':memory:');
  seed(db, cfg);
  const server = createApp({ db, config: cfg }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, token) => {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  return { base, db, call, close: () => { server.closeAllConnections(); server.close(); db.close(); } };
}

const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function bookingPayload(extra = {}) {
  return {
    carId: 2, pickupLocationId: 1, dropoffLocationId: 2, start: addDays(10), end: addDays(13), driverMode: 'self', addons: ['insurance'],
    customerName: 'Test Customer', customerEmail: 'Test@Example.com', customerPhone: '+1 555 010 1234', dateOfBirth: '1990-05-20',
    licenceNumber: 'AB-123456', licenceCountry: 'US', licenceExpiry: addDays(900), paymentMethod: 'pay_at_pickup', acceptTerms: true, ...extra,
  };
}

module.exports = { startServer, addDays, bookingPayload, config };
