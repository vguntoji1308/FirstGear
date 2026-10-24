'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { HttpError } = require('../errors');
const { validator, todayIso } = require('../validate');
const { importReviews } = require('../services/reviews');
const { signToken, requireAdmin } = require('../middleware');
const { bookingFilters, bookingReport } = require('../services/booking-report');

const BOOKING_STATUSES = ['confirmed', 'active', 'completed', 'cancelled'];
const { BRANDS } = require('../catalog');
const FUELS = ['petrol', 'diesel', 'hybrid', 'electric', 'cng'];
const CATEGORIES = ['economy', 'compact', 'family', 'suv', 'luxury', 'sports', 'electric', 'van'];
const BODIES = ['hatch', 'sedan', 'suv', 'sports', 'van'];
// Computed once: lets login take the same time whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function carInput(body) {
  const v = validator(body);
  v.oneOf('brand', Object.keys(BRANDS)); v.string('image', { optional: true, max: 120, pattern: /^\/img\/cars\/[\w.-]+\.(jpg|jpeg|png|webp)$/i, patternMsg: 'Use a path like /img/cars/my-car.jpg' });
  v.string('make', { max: 40 }); v.string('model', { max: 60 }); v.int('year', { min: 1990, max: new Date().getFullYear() + 1 });
  v.oneOf('category', CATEGORIES); v.oneOf('body', BODIES); v.string('color', { pattern: /^#[0-9a-fA-F]{6}$/, patternMsg: 'Use a #RRGGBB colour' });
  v.oneOf('transmission', ['automatic', 'manual']); v.oneOf('fuel', FUELS);
  v.int('seats', { min: 1, max: 12 }); v.int('bags', { min: 0, max: 12 });
  v.number('pricePerDay', { min: 1, max: 10000 }); v.number('deposit', { min: 0, max: 100000 });
  v.string('description', { optional: true, max: 500 });
  const d = v.done();
  const features = Array.isArray(body.features) ? body.features.filter((f) => typeof f === 'string').map((f) => f.trim().slice(0, 40)).filter(Boolean).slice(0, 12) : [];
  return { ...d, features: JSON.stringify(features) };
}

module.exports = function adminRoutes({ db, config, loginLimiter }) {
  const r = express.Router();

  r.post('/auth/login', loginLimiter, (req, res) => {
    const v = validator(req.body);
    v.string('email', { max: 254 }); v.string('password', { max: 200 });
    const d = v.done();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(d.email.toLowerCase());
    const ok = bcrypt.compareSync(d.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Invalid email or password');
    res.json({ token: signToken(config, user), user: { email: user.email, name: user.name, role: user.role } });
  });

  r.use('/admin', requireAdmin(config));

  r.get('/admin/summary', (_req, res) => {
    const one = (sql) => db.prepare(sql).get();
    res.json({
      cars: one('SELECT COUNT(*) AS n FROM cars WHERE active = 1').n,
      bookings: one("SELECT COUNT(*) AS n FROM bookings WHERE status != 'cancelled'").n,
      upcoming: one("SELECT COUNT(*) AS n FROM bookings WHERE status = 'confirmed' AND start_date >= date('now')").n,
      revenue: one("SELECT COALESCE(SUM(total),0) AS n FROM bookings WHERE status IN ('confirmed','active','completed')").n,
      pendingFeedback: one('SELECT COUNT(*) AS n FROM feedback WHERE approved = 0').n,
    });
  });

  // Cars
  r.get('/admin/cars', (_req, res) => res.json(db.prepare('SELECT * FROM cars ORDER BY id').all().map((c) => ({ ...c, features: JSON.parse(c.features) }))));
  r.post('/admin/cars', (req, res) => {
    const c = carInput(req.body);
    const info = db.prepare(`INSERT INTO cars (make, model, year, category, body, color, transmission, fuel, seats, bags, price_per_day, deposit, description, features, brand, image)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(c.make, c.model, c.year, c.category, c.body, c.color, c.transmission, c.fuel, c.seats, c.bags, c.pricePerDay, c.deposit, c.description, c.features, c.brand, c.image || null);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  r.put('/admin/cars/:id', (req, res) => {
    const c = carInput(req.body);
    const info = db.prepare(`UPDATE cars SET make=?, model=?, year=?, category=?, body=?, color=?, transmission=?, fuel=?, seats=?, bags=?,
      price_per_day=?, deposit=?, description=?, features=?, brand=?, image=?, active=? WHERE id=?`).run(c.make, c.model, c.year, c.category, c.body, c.color, c.transmission, c.fuel, c.seats, c.bags,
      c.pricePerDay, c.deposit, c.description, c.features, c.brand, c.image || null, req.body.active === false ? 0 : 1, +req.params.id);
    if (!info.changes) throw new HttpError(404, 'Car not found');
    res.json({ ok: true });
  });
  r.delete('/admin/cars/:id', (req, res) => { // soft delete keeps booking history intact
    const info = db.prepare('UPDATE cars SET active = 0 WHERE id = ?').run(+req.params.id);
    if (!info.changes) throw new HttpError(404, 'Car not found');
    res.json({ ok: true });
  });

  // Bookings
  r.get('/admin/bookings', (req, res) => {
    const { where, params } = bookingFilters(req.query);
    const rows = db.prepare(`SELECT b.id, b.car_id, b.ref, b.status, b.start_date, b.end_date, b.days, b.total, b.driver_mode, b.customer_name, b.customer_email,
      b.customer_phone, b.licence_number, b.licence_country, b.licence_expiry, b.date_of_birth, b.payment_method, b.notes, b.created_at,
      c.make || ' ' || c.model AS car, d.name AS driver FROM bookings b JOIN cars c ON c.id = b.car_id LEFT JOIN drivers d ON d.id = b.driver_id
      ${where} ORDER BY b.id DESC LIMIT 500`).all(...params);
    res.json(rows);
  });
  r.get('/admin/bookings/trends', (req, res) => {
    const v = validator(req.query);
    const dataset = v.oneOf('dataset', ['live', 'sample'], { optional: true });
    v.done();
    if (dataset === 'sample' && (config.appEnv !== 'dev' || config.isProd)) throw new HttpError(404, 'Sample trends are available in Dev only');
    res.set('Cache-Control', 'no-store');
    res.json(bookingReport(db, bookingFilters(req.query), { sample: dataset === 'sample' }));
  });
  r.patch('/admin/bookings/:id', (req, res) => {
    const v = validator(req.body); v.oneOf('status', BOOKING_STATUSES);
    const d = v.done();
    const info = db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(d.status, +req.params.id);
    if (!info.changes) throw new HttpError(404, 'Booking not found');
    res.json({ ok: true });
  });

  // Reviews & feedback moderation
  r.get('/admin/reviews', (_req, res) => res.json(db.prepare(`SELECT r.*, c.make || ' ' || c.model AS car FROM reviews r JOIN cars c ON c.id = r.car_id ORDER BY r.id DESC LIMIT 200`).all()));
  r.delete('/admin/reviews/:id', (req, res) => {
    if (!db.prepare('DELETE FROM reviews WHERE id = ?').run(+req.params.id).changes) throw new HttpError(404, 'Review not found');
    res.json({ ok: true });
  });
  r.get('/admin/feedback', (_req, res) => res.json(db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 200').all()));
  r.patch('/admin/feedback/:id', (req, res) => {
    const v = validator(req.body); v.bool('approved');
    const d = v.done();
    if (!db.prepare('UPDATE feedback SET approved = ? WHERE id = ?').run(d.approved ? 1 : 0, +req.params.id).changes) throw new HttpError(404, 'Feedback not found');
    res.json({ ok: true });
  });
  r.delete('/admin/feedback/:id', (req, res) => {
    if (!db.prepare('DELETE FROM feedback WHERE id = ?').run(+req.params.id).changes) throw new HttpError(404, 'Feedback not found');
    res.json({ ok: true });
  });

  // Import real reviews (e.g. from your Google Business Profile export). Duplicates are skipped.
  r.post('/admin/reviews/import', (req, res) => {
    const body = req.body || {};
    const list = Array.isArray(body.reviews) ? body.reviews : null;
    if (!list || !list.length || list.length > 500) throw new HttpError(400, 'Validation failed', { reviews: 'Provide between 1 and 500 reviews' });
    const rows = [], errs = {};
    list.forEach((item, i) => {
      const v = validator(item);
      v.string('author', { max: 80 }); v.int('rating', { min: 1, max: 5 }); v.string('text', { optional: true, max: 2000 });
      v.date('date', { optional: true }); v.string('url', { optional: true, max: 300, pattern: /^https?:[/][/]/i, patternMsg: 'Must start with http(s)://' });
      try { const d = v.done(); rows.push({ author: d.author, rating: d.rating, text: d.text || '', date: d.date || todayIso(), url: d.url || null }); }
      catch (e) { errs['reviews[' + i + ']'] = Object.values(e.details || {})[0] || e.message; }
    });
    if (Object.keys(errs).length) throw new HttpError(400, 'Validation failed', errs);
    res.json(importReviews(db, rows, { replace: body.replace === true }));
  });

  // Chauffeurs
  r.get('/admin/drivers', (_req, res) => res.json(db.prepare('SELECT * FROM drivers ORDER BY id').all()));
  r.post('/admin/drivers', (req, res) => {
    const v = validator(req.body); v.string('name', { max: 80 }); v.string('languages', { max: 80 }); v.int('yearsExperience', { min: 0, max: 60 });
    const d = v.done();
    const info = db.prepare('INSERT INTO drivers (name, languages, years_experience) VALUES (?, ?, ?)').run(d.name, d.languages, d.yearsExperience);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  r.patch('/admin/drivers/:id', (req, res) => {
    const v = validator(req.body); v.bool('active');
    const d = v.done();
    if (!db.prepare('UPDATE drivers SET active = ? WHERE id = ?').run(d.active ? 1 : 0, +req.params.id).changes) throw new HttpError(404, 'Driver not found');
    res.json({ ok: true });
  });

  return r;
};
