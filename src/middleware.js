'use strict';
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('./errors');

function limiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: message || 'Too many requests, please try again later.' }),
  });
}

function signToken(config, user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' });
}

function requireAdmin(config) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'Authentication required'));
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      if (payload.role !== 'admin') return next(new HttpError(403, 'Admin access required'));
      req.user = payload;
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
  };
}

module.exports = { limiter, signToken, requireAdmin };
