'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const run = (env) => spawnSync(process.execPath, ['-e', "require('./src/config')"], {
  cwd: path.resolve(__dirname, '..'), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8',
});

test('prod refuses to start with missing or placeholder secrets', () => {
  const r = run({ APP_ENV: 'prod' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /JWT_SECRET/);
  assert.match(r.stderr, /ADMIN_PASSWORD/);
  assert.notEqual(run({ APP_ENV: 'prod', JWT_SECRET: 'CHANGE_ME'.repeat(6), ADMIN_PASSWORD: 'CHANGE_ME_NOW_please' }).status, 0);
});

test('prod refuses wildcard CORS; valid prod config loads', () => {
  const ok = { APP_ENV: 'prod', JWT_SECRET: 'a8f3k2jd9s0qLmZx81nBv5Tg7YhP4wRc', ADMIN_PASSWORD: 'Str0ng-Prod-Passw0rd' };
  assert.equal(run(ok).status, 0);
  assert.notEqual(run({ ...ok, CORS_ORIGINS: '*' }).status, 0);
});

test('dev starts without secrets (generates ephemeral ones)', () => {
  assert.equal(run({ APP_ENV: 'dev' }).status, 0);
});
