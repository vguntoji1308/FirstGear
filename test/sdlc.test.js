'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer } = require('./helpers');
const { createRunner } = require('../src/services/sdlc');

async function fixture() {
  const calls = [];
  let mode = 'ok', release;
  const provider = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
    let body = ''; for await (const part of req) body += part;
    calls.push(JSON.parse(body));
    if (mode === 'slow') await new Promise((resolve) => { release = resolve; });
    if (mode === 'bad') return res.end(JSON.stringify({ message: { content: '{"summary": "missing artifact"}' } }));
    if (mode === 'error') { res.statusCode = 500; return res.end('{}'); }
    res.end(JSON.stringify({ message: { content: JSON.stringify({ summary: 'Proposed artifact', artifact: 'This is a proposal, not execution.', risks: ['Requires human review'] }) } }));
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => provider.once('listening', resolve));
  const s = await startServer({ appEnv: 'dev', sdlc: { ollamaUrl: `http://127.0.0.1:${provider.address().port}`, model: 'test-model', timeoutMs: 1000 } });
  const token = (await s.call('POST', '/api/auth/login', { email: 'admin@test.local', password: 'Test-Admin-Pass-123' })).body.token;
  const call = (method, url, body) => s.call(method, '/api/sdlc' + url, body, token);
  return { s, call, calls, setMode: (value) => { mode = value; }, release: () => release(),
    close: () => { s.close(); provider.closeAllConnections(); provider.close(); } };
}

test('SDLC APIs require admin; dashboard and APIs are unavailable in PROD', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.s.call('GET', '/api/sdlc/runs')).status, 401);
    assert.equal((await f.s.call('POST', '/api/sdlc/runs', {})).status, 401);
    assert.equal((await f.s.call('GET', '/sdlc')).status, 200);
    assert.deepEqual((await f.call('GET', '/models')).body.models, ['test-model']);
    assert.equal((await f.call('GET', '/runs/missing')).status, 404);
    const prod = await startServer({ appEnv: 'prod', isProd: true });
    try {
      for (const url of ['/sdlc', '/sdlc/', '/sdlc/dashboard.js', '/sdlc/dashboard.css', '/api/sdlc/runs', '/api/sdlc/models']) {
        assert.equal((await prod.call('GET', url)).status, 404, url);
      }
    } finally { prod.close(); }
  } finally { f.close(); }
});

test('all five agents persist artifacts, enforce approvals and hand off reviewed outputs', async () => {
  const f = await fixture();
  try {
    const created = await f.call('POST', '/runs', { title: 'Demo', request: 'Add a demo feature with tests', model: 'test-model' });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal(created.body.steps.length, 5);
    assert.equal((await f.call('POST', `/runs/${id}/review`, { decision: 'approve' })).status, 409);
    for (let i = 0; i < 5; i++) {
      const generated = await f.call('POST', `/runs/${id}/advance`);
      assert.equal(generated.status, 200);
      assert.equal(generated.body.steps[i].status, 'awaiting_approval');
      assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 409);
      assert.equal(JSON.parse(f.calls[i].messages[1].content).approvedStages.length, i);
      assert.equal((await f.call('POST', `/runs/${id}/review`, { decision: 'approve', feedback: 'Reviewed proposal' })).status, 200);
    }
    const run = (await f.call('GET', `/runs/${id}`)).body;
    assert.equal(run.complete, true);
    assert.ok(run.steps.every((step) => step.approved_by && step.approved_at && step.feedback === 'Reviewed proposal'));
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 409);
    assert.equal((await f.call('GET', '/runs')).body.runs.length, 1);
    assert.equal(f.s.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
  } finally { f.close(); }
});

test('revisions, provider failures and malformed model outputs remain visible and retryable', async () => {
  const f = await fixture();
  try {
    const id = (await f.call('POST', '/runs', { title: 'Retry', request: 'Test failure and revision behavior', model: 'test-model' })).body.id;
    f.setMode('bad');
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 502);
    assert.equal((await f.call('GET', `/runs/${id}`)).body.steps[0].status, 'failed');
    f.setMode('error');
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 502);
    f.setMode('ok');
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 200);
    assert.equal((await f.call('POST', `/runs/${id}/review`, { decision: 'revise' })).status, 400);
    assert.equal((await f.call('POST', `/runs/${id}/review`, { decision: 'revise', feedback: 'Add acceptance criteria' })).status, 200);
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 200);
    assert.equal(JSON.parse(f.calls.at(-1).messages[1].content).feedback, 'Add acceptance criteria');
    f.s.db.prepare("UPDATE sdlc_steps SET status='running' WHERE run_id=? AND position=0").run(id);
    createRunner({ db: f.s.db, config: { ...require('./helpers').config, sdlc: { ollamaUrl: 'http://127.0.0.1:1', timeoutMs: 100 } } });
    assert.match((await f.call('GET', `/runs/${id}`)).body.steps[0].error, /restarted/);
    assert.throws(() => createRunner({ db: f.s.db, config: { sdlc: { ollamaUrl: 'https://example.com' } } }), /loopback/);
  } finally { f.close(); }
});

test('parallel generation is blocked and provider timeouts are explicit', async () => {
  const f = await fixture();
  try {
    const id = (await f.call('POST', '/runs', { title: 'Concurrency', request: 'Test locking and timeouts', model: 'test-model' })).body.id;
    f.setMode('slow');
    const pending = f.call('POST', `/runs/${id}/advance`);
    // Wait for the request to enter the provider, not a fixed-duration sleep.
    while (!f.calls.length) await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await f.call('POST', `/runs/${id}/advance`)).status, 409);
    assert.equal((await pending).status, 504);
    f.release();
    assert.equal((await f.call('GET', `/runs/${id}`)).body.steps[0].status, 'failed');
  } finally { f.close(); }
});
