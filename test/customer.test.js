'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startServer, bookingPayload } = require('./helpers');

const phone = '+919876543210';
const settings = { accountSid: 'AC' + 'a'.repeat(32), authToken: 'test-only-secret', verifyServiceSid: 'VA' + 'b'.repeat(32) };
const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
function provider(requests) {
  return async (url, options) => {
    requests.push({ url, options });
    const body = new URLSearchParams(options.body);
    return new Response(JSON.stringify({ status: url.endsWith('/Verifications') ? 'pending' : body.get('Code') === '123456' ? 'approved' : 'pending' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
async function fixture(otpFetch) {
  const requests = [];
  const s = await startServer({ customerAuth: settings }, { otpFetch: otpFetch || provider(requests) });
  return { ...s, requests };
}
async function verified(s, number = phone) {
  const send = await s.call('POST', '/api/customer/otp/request', { phone: number });
  assert.equal(send.status, 200, JSON.stringify(send.body));
  const check = await s.call('POST', '/api/customer/otp/verify', { challengeId: send.body.challengeId, code: '123456' });
  assert.equal(check.status, 200);
  return { ...check.body, challengeId: send.body.challengeId };
}
async function register(s, token, buffer, extras = {}) {
  const form = new FormData();
  form.set('name', extras.name || 'Phone Customer');
  if (extras.consent !== false) form.set('consent', 'true');
  if (buffer) form.set('licence', new Blob([buffer], { type: extras.mime || 'image/png' }), extras.filename || 'licence.png');
  const response = await fetch(s.base + '/api/customer/register', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, body: await response.json() };
}

test('phone OTP registers with a private image, signs in again, revokes logout and preserves guest booking', async () => {
  const s = await fixture();
  try {
    const verification = await verified(s);
    assert.equal(verification.needsRegistration, true);
    assert.equal(s.requests.length, 2);
    assert.match(s.requests[0].url, /^https:\/\/verify.twilio.com\/v2\/Services\/VA/);
    assert.equal(new URLSearchParams(s.requests[0].options.body).get('Channel'), 'sms');
    assert.ok(!JSON.stringify(verification).includes('123456'));
    assert.equal((await s.call('POST', '/api/customer/otp/verify', { challengeId: verification.challengeId, code: '123456' })).status, 400);
    assert.equal((await s.call('GET', '/api/customer/me', null, verification.registrationToken)).status, 401);
    const result = await register(s, verification.registrationToken, await image());
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.customer.phone, phone);
    assert.equal(result.body.customer.licenceMime, 'image/webp');
    const token = result.body.token;
    const stored = s.db.prepare('SELECT * FROM customers').get();
    assert.equal((await sharp(stored.resume).metadata()).format, 'webp');
    const session = s.db.prepare("SELECT token_hash FROM customer_sessions WHERE purpose = 'login'").get();
    assert.notEqual(session.token_hash, token);
    assert.equal((await s.call('GET', '/api/customer/me', null, token)).body.name, 'Phone Customer');
    assert.equal((await s.call('GET', '/api/admin/summary', null, token)).status, 401);
    assert.equal((await s.call('GET', '/api/customer/licence')).status, 401);
    const download = await fetch(s.base + '/api/customer/licence', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'image/webp');
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.match(download.headers.get('content-disposition'), /attachment/);
    assert.equal((await download.arrayBuffer()).byteLength, stored.resume.length);
    assert.equal((await register(s, verification.registrationToken, await image())).status, 401);
    s.db.prepare('UPDATE otp_challenges SET created_at = created_at - 61000').run();
    const login = await verified(s);
    assert.equal(login.needsRegistration, false);
    assert.equal(login.customer.id, stored.id);
    assert.ok(login.token);
    assert.equal((await s.call('POST', '/api/customer/logout', {}, login.token)).status, 200);
    assert.equal((await s.call('GET', '/api/customer/me', null, login.token)).status, 401);
    assert.equal((await s.call('POST', '/api/bookings', bookingPayload())).status, 201, 'guest booking stays available');
  } finally { s.close(); }
});

test('OTP phone validation, cooldown, expiry, attempt limits and concurrent reuse', async () => {
  const s = await fixture();
  try {
    for (const number of ['9876543210', '+91 9876543210', '+0000000000', 'not-phone']) {
      assert.equal((await s.call('POST', '/api/customer/otp/request', { phone: number })).status, 400);
    }
    const send = await s.call('POST', '/api/customer/otp/request', { phone });
    assert.equal((await s.call('POST', '/api/customer/otp/request', { phone })).status, 429);
    for (let n = 0; n < 5; n++) {
      assert.equal((await s.call('POST', '/api/customer/otp/verify', { challengeId: send.body.challengeId, code: '000000' })).status, 400);
    }
    assert.equal((await s.call('POST', '/api/customer/otp/verify', { challengeId: send.body.challengeId, code: '123456' })).status, 400);
    assert.equal(s.requests.length, 6);
    const expired = await s.call('POST', '/api/customer/otp/request', { phone: '+919876543211' });
    s.db.prepare('UPDATE otp_challenges SET expires_at = 0 WHERE id = ?').run(expired.body.challengeId);
    assert.equal((await s.call('POST', '/api/customer/otp/verify', { challengeId: expired.body.challengeId, code: '123456' })).status, 400);
    const concurrent = await s.call('POST', '/api/customer/otp/request', { phone: '+919876543212' });
    const results = await Promise.all([1, 2].map(() => s.call('POST', '/api/customer/otp/verify', { challengeId: concurrent.body.challengeId, code: '123456' })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  } finally { s.close(); }
});

test('registration enforces file presence, consent and content decoding', async () => {
  const s = await fixture();
  try {
    const { registrationToken } = await verified(s);
    assert.equal((await register(s, 'invalid-token', await image())).status, 401);
    assert.equal((await register(s, registrationToken, null)).status, 400);
    assert.equal((await register(s, registrationToken, await image(), { consent: false })).status, 400);
    assert.equal((await register(s, registrationToken, Buffer.from('<script>alert(1)</script>'), { mime: 'image/jpeg' })).status, 400);
    assert.equal((await register(s, registrationToken, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), { mime: 'image/svg+xml' })).status, 400);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0);
  } finally { s.close(); }
});

test('registration enforces exact 10 MB boundary and session expiry', async () => {
  const s = await fixture();
  try {
    const { registrationToken } = await verified(s);
    const max = 10 * 1024 * 1024;
    assert.equal((await register(s, registrationToken, Buffer.alloc(max + 1))).status, 413);
    const source = await image();
    const exact = Buffer.concat([source, Buffer.alloc(max - source.length)]);
    assert.equal((await register(s, registrationToken, exact)).status, 201, 'exactly 10 MB must be accepted');
    const other = await verified(s, '+919876543211');
    s.db.prepare("UPDATE customer_sessions SET expires_at = 0 WHERE purpose = 'registration'").run();
    assert.equal((await register(s, other.registrationToken, source)).status, 401);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 1);
  } finally { s.close(); }
});

test('supported image formats decode to metadata-free WebP and customer downloads stay owner-only', async () => {
  const base = sharp({ create: { width: 10, height: 10, channels: 3, background: '#eeeeee' } });
  for (const format of ['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif']) {
    const s = await fixture();
    try {
      const imageBytes = await base.clone().toFormat(format).toBuffer();
      const account = await verified(s);
      const created = await register(s, account.registrationToken, imageBytes, { mime: `image/${format}`, filename: `resume.${format}` });
      assert.equal(created.status, 201, format);
      const token = created.body.token;
      const other = await verified(s, '+919876543211');
      const second = await register(s, other.registrationToken, await image(), { name: 'Other Owner' });
      assert.equal(second.status, 201);
      const attempt = await s.call('GET', `/api/customer/me?id=${created.body.customer.id}`, null, second.body.token);
      assert.equal(attempt.body.name, 'Other Owner', 'query IDs cannot select another account');
      const metadata = await sharp(s.db.prepare('SELECT resume FROM customers WHERE id = ?').get(created.body.customer.id).resume).metadata();
      assert.equal(metadata.format, 'webp');
      assert.equal(metadata.exif, undefined);
      const admin = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
      assert.equal((await s.call('GET', '/api/customer/licence', null, admin)).status, 401);
      assert.equal((await s.call('GET', '/api/config')).body.customerAuth, undefined);
      s.db.prepare("UPDATE customer_sessions SET expires_at = 0 WHERE customer_id = ?").run(created.body.customer.id);
      assert.equal((await s.call('GET', '/api/customer/me', null, token)).status, 401);
    } finally { s.close(); }
  }
});

test('phone send budgets and superseded OTP challenges are enforced across requests', async () => {
  const s = await fixture();
  try {
    let previous;
    for (let n = 0; n < 5; n++) {
      const response = await s.call('POST', '/api/customer/otp/request', { phone });
      assert.equal(response.status, 200);
      if (previous) assert.equal((await s.call('POST', '/api/customer/otp/verify', { challengeId: previous, code: '123456' })).status, 400);
      previous = response.body.challengeId;
      s.db.prepare('UPDATE otp_challenges SET created_at = created_at - 61000').run();
    }
    assert.equal((await s.call('POST', '/api/customer/otp/request', { phone })).status, 429);
    assert.equal(s.requests.length, 5);
  } finally { s.close(); }
});

test('provider failure and missing credentials are explicit, never a mock success or a leaked secret', async () => {
  const unconfigured = await startServer({ customerAuth: { accountSid: '', authToken: '', verifyServiceSid: '' } });
  try {
    const response = await unconfigured.call('POST', '/api/customer/otp/request', { phone });
    assert.equal(response.status, 503);
    assert.match(response.body.error, /not configured/);
  } finally { unconfigured.close(); }
  for (const [provider, expected] of [
    [async () => new Response(JSON.stringify({ message: settings.authToken }), { status: 401 }), 502],
    [async () => { throw new Error(settings.authToken); }, 503],
    [async () => { const err = new Error('Timeout'); err.name = 'TimeoutError'; throw err; }, 504],
    [async () => new Response('{}', { status: 429 }), 429],
  ]) {
    const s = await fixture(provider);
    try {
      const response = await s.call('POST', '/api/customer/otp/request', { phone });
      assert.equal(response.status, expected);
      assert.ok(!JSON.stringify(response.body).includes(settings.authToken));
      assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM customers').get().count, 0);
    } finally { s.close(); }
  }
});
