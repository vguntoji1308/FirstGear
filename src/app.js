'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const { HttpError } = require('./errors');
const { limiter } = require('./middleware');
const { createBot } = require('./chatbot');
const { validator } = require('./validate');

function createApp({ db, config, otpFetch, googleFetch }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  }));
  // No CORS headers unless origins are explicitly allow-listed.
  if (config.corsOrigins.length) {
    app.use('/api', cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600 }));
  }
  app.use(compression()); // gzip HTML/CSS/JS/JSON (WebP images are already compressed and are skipped)
  app.use(express.json({ limit: '20kb' }));

  const rl = config.rateLimit;
  app.use('/api', limiter({ windowMs: rl.windowMs, max: rl.max }));
  const writeLimiter = limiter({ windowMs: rl.windowMs, max: rl.writeMax });
  const loginLimiter = limiter({ windowMs: rl.windowMs, max: rl.loginMax, message: 'Too many login attempts, try again later.' });
  const chatLimiter = limiter({ windowMs: 60 * 1000, max: 40 });

  const bot = createBot({ db, config });
  const api = express.Router();
  api.use(require('./routes/public')({ db, config, writeLimiter }));
  api.use(require('./routes/admin')({ db, config, loginLimiter }));
  api.use('/customer', require('./routes/customer')({ db, config, otpFetch }));
  api.get('/google-reviews', limiter({ windowMs: 60000, max: 10 }), async (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const settings = config.googlePlaces;
    if (!settings?.apiKey || !settings?.placeId) return next(new HttpError(503, 'Google reviews are not configured. Set GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID on the server.'));
    try {
      const result = await require('./services/google-places').fetchGoogleReviews({ ...settings, fetchImpl: googleFetch });
      const items = result.rows.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date))
        .map((r, i) => ({ ...r, id: `google-${i}`, source: 'google' }));
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      items.forEach((r) => { distribution[r.rating]++; });
      res.json({ items, summary: { count: items.length, average: items.length ? Math.round(items.reduce((sum, r) => sum + r.rating, 0) / items.length * 10) / 10 : null, distribution },
        listingRating: result.rating, listingCount: result.total, googleUrl: result.mapsUrl || config.business.googleReviewsUrl });
    } catch (err) { next(new HttpError(502, err.message)); }
  });
  if (config.appEnv === 'dev' && !config.isProd) {
    api.use('/sdlc', require('./routes/sdlc')({ db, config, writeLimiter }));
  }
  // Express 4 does not catch rejected promises, so forward errors to the error handler explicitly.
  api.post('/chat', chatLimiter, async (req, res, next) => {
    try {
      const v = validator(req.body); v.string('message', { max: 500 });
      const { message } = v.done();
      res.json(await bot.reply({ message, history: [] }));
    } catch (e) { next(e); }
  });
  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use('/api', api);

  const calendarDist = path.dirname(require.resolve('flatpickr/dist/flatpickr.min.js'));
  app.get('/vendor/flatpickr.js', (_req, res) => res.sendFile(path.join(calendarDist, 'flatpickr.min.js')));
  app.get('/vendor/flatpickr.css', (_req, res) => res.sendFile(path.join(calendarDist, 'flatpickr.min.css')));

  // Keep documentation outside the public directory so static serving cannot bypass the environment gate.
  if (config.appEnv === 'dev' && !config.isProd) {
    const docs = path.join(config.root, 'docs');
    const noCache = (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      next();
    };
    app.get(['/docs', '/docs/', '/docs.html'], noCache, (_req, res) => res.sendFile(path.join(docs, 'usage.html')));
    app.get('/docs/api', noCache, (_req, res) => res.type('text/plain').sendFile(path.join(docs, 'API.md')));
    app.get('/docs/usage.js', noCache, (_req, res) => res.sendFile(path.join(docs, 'usage.js')));
    app.get('/docs/usage.css', noCache, (_req, res) => res.sendFile(path.join(docs, 'usage.css')));
    app.get(['/sdlc', '/sdlc/'], noCache, (_req, res) => res.sendFile(path.join(config.root, 'sdlc', 'index.html')));
    app.get('/sdlc/dashboard.js', noCache, (_req, res) => res.sendFile(path.join(config.root, 'sdlc', 'dashboard.js')));
    app.get('/sdlc/dashboard.css', noCache, (_req, res) => res.sendFile(path.join(config.root, 'sdlc', 'dashboard.css')));
  }

  // Images rarely change: let browsers/CDNs cache them for a week. Code and pages revalidate (1h in prod).
  app.use(express.static(path.join(config.root, 'public'), {
    extensions: ['html'],
    setHeaders: (res, file) => {
      const f = file.split(path.sep).join('/');
      if (f.includes('/public/img/')) res.setHeader('Cache-Control', 'public, max-age=604800');
      else res.setHeader('Cache-Control', config.isProd ? 'public, max-age=3600' : 'no-cache');
    },
  }));
  app.use((_req, res) => res.status(404).sendFile(path.join(config.root, 'public', '404.html')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
