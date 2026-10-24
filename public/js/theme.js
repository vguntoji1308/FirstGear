'use strict';
/* Theme (dark/light). Loaded synchronously in <head> so the right palette applies before first paint. */
(function () {
  var KEY = 'fg_theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function stored() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
  function preferred() { return stored() || (media && media.matches ? 'light' : 'dark'); }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f6fb' : '#0a0a12');
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'light'));
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      btn.setAttribute('title', theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  function set(theme) { try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode: still apply for this page */ } apply(theme); }
  function toggle() { set(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }

  apply(preferred());
  // Follow the OS setting until the visitor makes an explicit choice.
  if (media && media.addEventListener) media.addEventListener('change', function () { if (!stored()) apply(preferred()); });
  window.FGTheme = { toggle: toggle, set: set, apply: function () { apply(root.getAttribute('data-theme') || preferred()); } };
})();
