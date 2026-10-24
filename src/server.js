'use strict';
const config = require('./config');
const { openDb } = require('./db');
const { seed } = require('./seed');
const { createApp } = require('./app');

config.warnings.forEach((w) => console.warn(`[config] ${w}`));
const db = openDb(config.dbPath);
seed(db, config);
const app = createApp({ db, config });

const server = app.listen(config.port, config.host, () => console.log(`${config.business.name} [${config.appEnv}] listening on http://localhost:${config.port}`));
const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
