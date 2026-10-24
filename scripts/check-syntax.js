// Minimal "lint": syntax-check every server and client JS file without extra dependencies.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'public/js', 'docs', 'test', 'scripts'];
let failed = 0;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);

for (const file of roots.flatMap((r) => (fs.existsSync(r) ? walk(r) : []))) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (e) { failed++; console.error(`Syntax error in ${file}\n${e.stderr}`); }
}
if (failed) process.exit(1);
console.log('Syntax check passed.');
