'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startServer } = require('./helpers');

const root = path.resolve(__dirname, '..');
const routes = ['/docs', '/docs/', '/docs.html', '/docs/api', '/docs/usage.js', '/docs/usage.css'];

test('Dev serves usage Docs and reference outside the public directory without caching', async () => {
  const s = await startServer({ appEnv: 'dev' });
  try {
    for (const route of routes) {
      const res = await s.call('GET', route);
      assert.equal(res.status, 200, route);
      assert.equal(res.headers.get('cache-control'), 'no-store', route);
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', route);
    }
    assert.match((await s.call('GET', '/docs')).body, /Usage &amp; API Docs/);
    assert.match((await s.call('GET', '/docs/api')).headers.get('content-type'), /text\/plain/);
    assert.match((await s.call('GET', '/docs')).headers.get('content-security-policy'), /script-src 'self'/);
  } finally { s.close(); }
});

test('PROD and non-Dev environments cannot access Docs or supporting files', async () => {
  for (const cfg of [{ appEnv: 'prod', isProd: true }, { appEnv: 'test' }, { appEnv: 'dev', isProd: true }]) {
    const s = await startServer(cfg);
    try {
      for (const route of [...routes, '/docs/API.md', '/docs/usage.html', '/usage.html', '/usage.js', '/usage.css']) {
        assert.equal((await s.call('GET', route)).status, 404, `${JSON.stringify(cfg)} ${route}`);
      }
      assert.equal((await s.call('GET', '/')).status, 200);
      assert.equal((await s.call('GET', '/api/health')).status, 200);
    } finally { s.close(); }
  }
});

test('API reference lists every actual API method and path explicitly', () => {
  const reference = fs.readFileSync(path.join(root, 'docs', 'API.md'), 'utf8');
  for (const file of ['src/routes/public.js', 'src/routes/admin.js', 'src/routes/customer.js', 'src/app.js']) {
    const source = fs.readFileSync(path.join(root, ...file.split('/')), 'utf8');
    for (const [, method, route] of source.matchAll(/(?:r|api)\.(get|post|put|patch|delete)\('([^']+)'/g)) {
      const fullRoute = file.endsWith('/customer.js') ? `/customer${route}` : route;
      assert.ok(reference.includes(`${method.toUpperCase()} ${fullRoute}`), `${method.toUpperCase()} /api${fullRoute}`);
    }
  }
});

test('the PowerShell Docs example quotes, books, looks up and cancels using real API data', { skip: process.platform !== 'win32' }, async () => {
  const s = await startServer({ appEnv: 'dev' });
  try {
    const elements = new Map();
    const element = (id) => {
      if (!elements.has(id)) elements.set(id, { textContent: '', setAttribute() {} });
      return elements.get(id);
    };
    let ready;
    const context = {
      location: { origin: s.base },
      document: { getElementById: element, addEventListener: (_event, callback) => { ready = callback; } },
      fetch,
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'docs', 'usage.js'), 'utf8'), context);
    // Node fetch requires an absolute URL; the browser correctly uses a same-origin relative URL.
    context.fetch = (url) => fetch(new URL(url, s.base));
    await ready();
    assert.equal(element('reference-status').textContent, 'Reference loaded from docs/API.md.');
    const script = '$ErrorActionPreference = \'Stop\'\n' + element('booking-script').textContent +
      '\n$cancel = @{ ref = $result.ref; email = $booking.customerEmail } | ConvertTo-Json\n' +
      'Invoke-RestMethod "$base/bookings/cancel" -Method Post -ContentType \'application/json\' -Body $cancel | ConvertTo-Json -Depth 10';
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 30000 });
    assert.match(stdout, /FG-[0-9A-F]{8}/);
    assert.match(stdout, /cancelled/);
    assert.equal(s.db.prepare('SELECT status FROM bookings').get().status, 'cancelled');
  } finally { s.close(); }
});
