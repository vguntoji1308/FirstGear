'use strict';
const express = require('express');
const { requireAdmin } = require('../middleware');
const { validator } = require('../validate');
const { createRunner, ROLES } = require('../services/sdlc');

module.exports = ({ db, config, writeLimiter }) => {
  const router = express.Router();
  const runner = createRunner({ db, config });
  router.use(requireAdmin(config));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  router.get('/models', asyncRoute(async (_req, res) => res.json({ models: await runner.models(), defaultModel: config.sdlc.model })));
  router.get('/runs', (_req, res) => res.json({ runs: runner.list(), roles: ROLES.map(({ id, name }) => ({ id, name })) }));
  router.get('/runs/:id', (req, res) => res.json(runner.get(req.params.id)));
  router.post('/runs', writeLimiter, (req, res) => {
    const v = validator(req.body);
    v.string('title', { max: 120 }); v.string('request', { min: 10, max: 8000 });
    v.string('model', { max: 120, pattern: /^[a-zA-Z0-9_.:/-]+$/, patternMsg: 'Use a locally installed Ollama model name' });
    res.status(201).json(runner.create(v.done(), req.user));
  });
  router.post('/runs/:id/advance', writeLimiter, asyncRoute(async (req, res) => res.json(await runner.advance(req.params.id))));
  router.post('/runs/:id/review', writeLimiter, (req, res) => {
    const v = validator(req.body);
    v.oneOf('decision', ['approve', 'revise']); v.string('feedback', { optional: true, max: 4000 });
    const data = v.done();
    res.json(runner.review(req.params.id, data.decision === 'approve', data.feedback, req.user));
  });
  return router;
};
