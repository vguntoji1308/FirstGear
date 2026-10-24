'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startServer } = require('./helpers');

test('calendar assets are served locally in Dev and PROD', async () => {
  for (const config of [{ appEnv: 'dev' }, { appEnv: 'prod', isProd: true }]) {
    const server = await startServer(config);
    try {
      for (const url of ['/vendor/flatpickr.js', '/vendor/flatpickr.css', '/js/calendar.js']) {
        assert.equal((await server.call('GET', url)).status, 200, url);
      }
    } finally { server.close(); }
  }
});

test('calendar synchronization preserves adjusted return values when minimum dates change', () => {
  const listeners = new Map();
  const input = {
    id: 'return', value: '2026-11-14', min: '2026-11-14', max: '', form: null,
    addEventListener: (event, listener) => listeners.set(event, listener),
  };
  let options;
  const picker = {
    altInput: { setAttribute() {} },
    set: (key, value) => {
      // Flatpickr clears a stale internal selection when its minimum changes.
      if (key === 'minDate' && value) input.value = '';
    },
    setDate: (value) => { input.value = value; },
  };
  const context = {
    window: { flatpickr: (_input, config) => { options = config; input._flatpickr = picker; return picker; } },
    document: { querySelectorAll: () => [input], querySelector: () => null },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'calendar.js'), 'utf8'), context);
  context.window.initDatePickers();
  assert.equal(options.dateFormat, 'Y-m-d');
  assert.equal(options.altFormat, 'd M Y');
  assert.equal(options.disableMobile, true);
  assert.equal(options.allowInput, true);
  listeners.get('change')();
  assert.equal(input.value, '2026-11-14');
  options.onOpen([], '', picker);
  assert.equal(input.value, '2026-11-14');
});
