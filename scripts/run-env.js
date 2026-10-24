// Cross-platform launcher: node scripts/run-env.js <dev|prod> [--watch]
// Sets APP_ENV (works on Windows, macOS, Linux) and starts the server.
const { spawn } = require('node:child_process');
const path = require('node:path');

const [env, ...flags] = process.argv.slice(2);
if (!['dev', 'prod'].includes(env)) { console.error('Usage: run-env.js <dev|prod> [--watch]'); process.exit(2); }

const child = spawn(process.execPath, [...flags, path.join(__dirname, '..', 'src', 'server.js')], {
  stdio: 'inherit', env: { ...process.env, APP_ENV: env },
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
