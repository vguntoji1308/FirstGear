'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('hero carousel rotates automatically with dots and pauses on hover, focus and reduced motion', () => {
  const source = fs.readFileSync(require.resolve('../public/js/home.js'), 'utf8');
  const functionSource = source.slice(source.indexOf('  function premiumCarousel('), source.indexOf("\n  document.addEventListener('vr:ready'"));
  const element = () => {
    const classes = new Set(), attributes = {};
    return {
      classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) },
      setAttribute(name, value) { attributes[name] = value; },
      removeAttribute(name) { delete attributes[name]; },
      addEventListener(name, fn) { this.events[name] = fn; },
      events: {}, attributes,
    };
  };
  const slides = [element(), element()], dots = [element(), element()], images = [element(), element()];
  const root = element(), pause = element(), art = element(), document = element(), window = element(), motion = element();
  root.contains = (el) => el === pause;
  root.querySelectorAll = (selector) => selector === '.premium-slide' ? slides : selector === '.premium-slide img' ? images : dots;
  window.matchMedia = () => motion;
  document.hidden = false;
  let tick, delay;
  const context = {
    $, esc: (s) => s, money: (_cfg, value) => value, document, window,
    setInterval(fn, ms) { tick = fn; delay = ms; return 1; },
    clearInterval() { tick = null; },
    setTimeout(fn) { fn(); },
  };
  function $(selector) { return { '#hero-art': art, '.hero-premium': root, '#premium-pause': pause }[selector]; }
  vm.runInNewContext(functionSource + '\npremiumCarousel(cars, {});', vm.createContext({
    ...context, cars: [{ id: 48, model: 'Thar', make: 'Mahindra', image: '/thar.webp', pricePerDay: 5000 },
      { id: 34, model: 'XUV700', make: 'Mahindra', image: '/xuv.webp', pricePerDay: 7500 }],
  }));
  assert.match(art.innerHTML, /hero-48.webp/);
  assert.match(art.innerHTML, /premium-dots/);
  assert.ok(!art.innerHTML.includes('premium-prev'));
  assert.ok(!art.innerHTML.includes('premium-pause'));
  assert.equal(delay, 2000);
  assert.ok(slides[0].classList.contains('is-current'));
  tick();
  assert.ok(slides[1].classList.contains('is-current'));
  assert.equal(slides[0].inert, true);
  assert.equal(dots[1].attributes['aria-current'], 'true');
  images[0].events.mouseenter();
  assert.equal(tick, null);
  images[0].events.mouseleave();
  assert.equal(typeof tick, 'function');
  document.activeElement = pause;
  root.events.focusin();
  assert.equal(tick, null);
  document.activeElement = null;
  root.events.focusout();
  assert.equal(typeof tick, 'function');
  motion.matches = true;
  motion.events.change();
  assert.equal(tick, null);
});
