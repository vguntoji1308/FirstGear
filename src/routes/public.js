'use strict';
const express = require('express');
const { HttpError } = require('../errors');
const { BRANDS } = require('../catalog');
const { listReviews } = require('../services/reviews');
const { validator, todayIso, shiftYears, daysBetween, ageOn } = require('../validate');
const { transaction } = require('../db');
const { ADDONS, computeQuote } = require('../services/pricing');
const avail = require('../services/availability');
const crypto = require('node:crypto');

const CATEGORIES = ['economy', 'compact', 'family', 'suv', 'luxury', 'sports', 'electric', 'van'];

const carDto = (c, stats) => ({
  id: c.id, make: c.make, model: c.model, brand: c.brand, image: c.image, year: c.year, category: c.category, body: c.body, color: c.color,
  transmission: c.transmission, fuel: c.fuel, seats: c.seats, bags: c.bags, pricePerDay: c.price_per_day,
  deposit: c.deposit, description: c.description, features: JSON.parse(c.features),
  rating: { average: stats?.avg ? Math.round(stats.avg * 10) / 10 : null, count: stats?.cnt || 0 },
});

module.exports = function publicRoutes({ db, config, writeLimiter }) {
  const r = express.Router();
  const { rental } = config;

  const statsFor = (id) => db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews WHERE car_id = ?').get(id);
  const allStats = () => new Map(db.prepare('SELECT car_id, AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews GROUP BY car_id').all().map((s) => [s.car_id, s]));

  // Validates a date range and returns {start, end, days}
  function range(v, { allowPast = false } = {}) {
    const start = v.date('start'), end = v.date('end');
    v.done();
    if (!allowPast && start < todayIso()) throw new HttpError(400, 'Validation failed', { start: 'Pick-up date cannot be in the past' });
    const days = daysBetween(start, end);
    if (days < 1) throw new HttpError(400, 'Validation failed', { end: 'Return date must be after pick-up date' });
    if (days > rental.maxRentalDays) throw new HttpError(400, 'Validation failed', { end: `Maximum rental is ${rental.maxRentalDays} days` });
    return { start, end, days };
  }

  r.get('/health', (_req, res) => res.json({ status: 'ok', env: config.appEnv, time: new Date().toISOString() }));

  r.get('/config', (_req, res) => res.json({
    business: config.business,
    rental: {
      currency: rental.currency, currencySymbol: rental.currencySymbol, taxRate: rental.taxRate, minDriverAge: rental.minDriverAge,
      youngDriverUnder: rental.youngDriverUnder, minChauffeurAge: rental.minChauffeurAge, youngDriverFeePerDay: rental.youngDriverFeePerDay, maxRentalDays: rental.maxRentalDays,
      weeklyDiscount: rental.weeklyDiscount, chauffeurDailyRate: rental.chauffeurDailyRate, freeCancellationHours: rental.freeCancellationHours,
      earliestDateOfBirth: shiftYears(todayIso(), -80), latestLicenceExpiry: shiftYears(todayIso(), 20),
    },
    addons: Object.values(ADDONS), categories: CATEGORIES, brands: BRANDS, env: config.appEnv,
  }));

  r.get('/locations', (_req, res) => res.json(db.prepare('SELECT id, name, address FROM locations WHERE active = 1 ORDER BY id').all()));

  // Fleet catalog with filters; optional start/end adds an availability flag.
  r.get('/cars', (req, res) => {
    const q = req.query;
    const where = ['active = 1'], params = [];
    if (CATEGORIES.includes(q.category)) { where.push('category = ?'); params.push(q.category); }
    if (['automatic', 'manual'].includes(q.transmission)) { where.push('transmission = ?'); params.push(q.transmission); }
    if (Object.keys(BRANDS).includes(q.brand)) { where.push('brand = ?'); params.push(q.brand); }
    if (['petrol', 'diesel', 'hybrid', 'electric', 'cng'].includes(q.fuel)) { where.push('fuel = ?'); params.push(q.fuel); }
    if (Number.isInteger(+q.seats) && +q.seats > 0) { where.push('seats >= ?'); params.push(+q.seats); }
    if (Number.isFinite(+q.minPrice) && q.minPrice !== undefined && q.minPrice !== '') { where.push('price_per_day >= ?'); params.push(+q.minPrice); }
    if (Number.isFinite(+q.maxPrice) && q.maxPrice !== undefined && q.maxPrice !== '') { where.push('price_per_day <= ?'); params.push(+q.maxPrice); }
    if (typeof q.q === 'string' && q.q.trim()) { where.push('(make LIKE ? OR model LIKE ?)'); const like = `%${q.q.trim().slice(0, 40).replace(/[%_]/g, '')}%`; params.push(like, like); }
    const order = { price_asc: 'price_per_day ASC', price_desc: 'price_per_day DESC', newest: 'year DESC, id DESC' }[q.sort] || 'id ASC';
    const cars = db.prepare(`SELECT * FROM cars WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...params);

    let blocked = null;
    if (q.start && q.end) {
      const v = validator({ start: q.start, end: q.end });
      const { start, end } = range(v);
      blocked = avail.unavailableCarIds(db, start, end);
    }
    const stats = allStats();
    let out = cars.map((c) => ({ ...carDto(c, stats.get(c.id)), available: blocked ? !blocked.has(c.id) : null }));
    if (q.sort === 'rating') out = out.sort((a, b) => (b.rating.average || 0) - (a.rating.average || 0));
    if (q.availableOnly === 'true' && blocked) out = out.filter((c) => c.available);
    res.json(out);
  });

  r.get('/cars/:id', (req, res) => {
    const car = db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(+req.params.id);
    if (!car) throw new HttpError(404, 'Car not found');
    const reviews = db.prepare('SELECT id, rating, author, comment, created_at FROM reviews WHERE car_id = ? ORDER BY id DESC LIMIT 50').all(car.id);
    res.json({ ...carDto(car, statsFor(car.id)), reviews });
  });

  r.post('/cars/:id/reviews', writeLimiter, (req, res) => {
    const car = db.prepare('SELECT id FROM cars WHERE id = ? AND active = 1').get(+req.params.id);
    if (!car) throw new HttpError(404, 'Car not found');
    const v = validator(req.body);
    v.int('rating', { min: 1, max: 5 }); v.string('author', { max: 60 }); v.string('comment', { optional: true, max: 600 });
    const d = v.done();
    db.prepare('INSERT INTO reviews (car_id, rating, author, comment) VALUES (?, ?, ?, ?)').run(car.id, d.rating, d.author, d.comment);
    const s = statsFor(car.id);
    res.status(201).json({ rating: { average: Math.round(s.avg * 10) / 10, count: s.cnt } });
  });

  r.get('/availability/driver', (req, res) => {
    const { start, end } = range(validator(req.query));
    const free = avail.driversFreeCount(db, start, end);
    res.json({ available: free > 0, driversFree: free, dailyRate: rental.chauffeurDailyRate });
  });

  // Shared by /quote and /bookings
  function parseTrip(input, { requireCustomer }) {
    const v = validator(input);
    v.int('carId', { min: 1 });
    v.int('pickupLocationId', { min: 1 }); v.int('dropoffLocationId', { min: 1 });
    v.oneOf('driverMode', ['self', 'chauffeur'], { optional: true });
    const trip = { ...range(validator({ start: input?.start, end: input?.end })) };
    const base = v.done();
    const driverMode = base.driverMode || 'self';
    const car = db.prepare('SELECT * FROM cars WHERE id = ? AND active = 1').get(base.carId);
    if (!car) throw new HttpError(404, 'Car not found');
    for (const [f, id] of [['pickupLocationId', base.pickupLocationId], ['dropoffLocationId', base.dropoffLocationId]]) {
      if (!db.prepare('SELECT 1 FROM locations WHERE id = ? AND active = 1').get(id)) throw new HttpError(400, 'Validation failed', { [f]: 'Unknown location' });
    }
    const raw = Array.isArray(input.addons) ? input.addons : [];
    const addonIds = [...new Set(raw)];
    for (const id of addonIds) {
      if (!ADDONS[id]) throw new HttpError(400, 'Validation failed', { addons: `Unknown add-on: ${String(id).slice(0, 30)}` });
      if (driverMode === 'chauffeur' && ADDONS[id].selfOnly) throw new HttpError(400, 'Validation failed', { addons: `${ADDONS[id].label} is only for self-drive rentals` });
    }
    let age;
    let customer = null;
    if (requireCustomer) {
      const c = validator(input);
      c.string('customerName', { min: 2, max: 100 }); c.email('customerEmail'); c.phone('customerPhone');
      c.date('dateOfBirth');
      if (driverMode === 'self') {
        c.string('licenceNumber', { min: 5, max: 20, pattern: /^[A-Za-z0-9 -]+$/, patternMsg: 'Letters, numbers, spaces and dashes only' });
        c.string('licenceCountry', { min: 2, max: 60 }); c.date('licenceExpiry');
      }
      c.oneOf('paymentMethod', ['pay_at_pickup', 'pay_online_demo'], { optional: true });
      c.string('notes', { optional: true, max: 500 });
      c.bool('acceptTerms');
      customer = c.done();
      const errs = {};
      if (!customer.acceptTerms) errs.acceptTerms = 'You must accept the rental terms';
      age = ageOn(customer.dateOfBirth, trip.start);
      const minAge = driverMode === 'chauffeur' ? rental.minChauffeurAge : rental.minDriverAge;
      if (age < minAge) errs.dateOfBirth = `The minimum age for this booking is ${minAge}`;
      if (customer.dateOfBirth < shiftYears(todayIso(), -80)) errs.dateOfBirth = 'Date of birth cannot be earlier than 80 years before today';
      if (driverMode === 'self' && customer.licenceExpiry <= trip.end) errs.licenceExpiry = 'Licence must be valid through the return date';
      if (driverMode === 'self' && customer.licenceExpiry > shiftYears(todayIso(), 20)) errs.licenceExpiry = 'Licence expiry cannot be more than 20 years from today';
      if (Object.keys(errs).length) throw new HttpError(400, 'Validation failed', errs);
    } else if (input.dateOfBirth) {
      const c = validator(input); c.date('dateOfBirth'); const d = c.done();
      if (d.dateOfBirth < shiftYears(todayIso(), -80)) throw new HttpError(400, 'Validation failed', { dateOfBirth: 'Date of birth cannot be earlier than 80 years before today' });
      age = ageOn(d.dateOfBirth, trip.start);
    }
    return { base, driverMode, car, trip, addonIds, age, customer };
  }

  r.post('/quote', (req, res) => {
    const { car, trip, driverMode, addonIds, age } = parseTrip(req.body || {}, { requireCustomer: false });
    const quote = computeQuote({ car, days: trip.days, driverMode, addonIds, age, rental });
    res.json({
      ...quote,
      carAvailable: avail.carIsAvailable(db, car.id, trip.start, trip.end),
      driverAvailable: driverMode === 'chauffeur' ? avail.driversFreeCount(db, trip.start, trip.end) > 0 : null,
    });
  });

  const bookingDto = (b) => ({
    ref: b.ref, status: b.status, carId: b.car_id, car: `${b.make} ${b.model}`, start: b.start_date, end: b.end_date, days: b.days,
    pickupLocation: b.pickup_location, dropoffLocation: b.dropoff_location, driverMode: b.driver_mode,
    chauffeur: b.driver_name || null, addons: JSON.parse(b.addons), priceBreakdown: JSON.parse(b.price_breakdown), total: b.total,
    customerName: b.customer_name, paymentMethod: b.payment_method, createdAt: b.created_at,
  });
  const BOOKING_SELECT = `SELECT b.*, c.make, c.model, pl.name AS pickup_location, dl.name AS dropoff_location, d.name AS driver_name
    FROM bookings b JOIN cars c ON c.id = b.car_id JOIN locations pl ON pl.id = b.pickup_location_id
    JOIN locations dl ON dl.id = b.dropoff_location_id LEFT JOIN drivers d ON d.id = b.driver_id`;

  r.post('/bookings', writeLimiter, (req, res) => {
    const { base, driverMode, car, trip, addonIds, age, customer } = parseTrip(req.body || {}, { requireCustomer: true });
    const booking = transaction(db, () => {
      if (!avail.carIsAvailable(db, car.id, trip.start, trip.end)) throw new HttpError(409, 'Sorry, this car is no longer available for those dates.');
      let driver = null;
      if (driverMode === 'chauffeur') {
        driver = avail.freeDriver(db, trip.start, trip.end);
        if (!driver) throw new HttpError(409, 'No GearPilot driver is available for those dates. Try self-drive or different dates.');
      }
      const quote = computeQuote({ car, days: trip.days, driverMode, addonIds, age, rental });
      const ref = `FG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO bookings (ref, car_id, pickup_location_id, dropoff_location_id, start_date, end_date, days, driver_mode, driver_id,
        addons, price_breakdown, total, customer_name, customer_email, customer_phone, date_of_birth, licence_number, licence_country,
        licence_expiry, payment_method, notes, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed')`).run(
        ref, car.id, base.pickupLocationId, base.dropoffLocationId, trip.start, trip.end, trip.days, driverMode, driver ? driver.id : null,
        JSON.stringify(addonIds), JSON.stringify(quote), quote.total, customer.customerName, customer.customerEmail, customer.customerPhone,
        customer.dateOfBirth, customer.licenceNumber || null, customer.licenceCountry || null, customer.licenceExpiry || null,
        customer.paymentMethod || 'pay_at_pickup', customer.notes || '');
      return db.prepare(`${BOOKING_SELECT} WHERE b.ref = ?`).get(ref);
    });
    res.status(201).json({ ...bookingDto(booking), deposit: driverMode === 'self' ? car.deposit : 0 });
  });

  // Guests look up a booking with reference + email (both required, so refs can't be enumerated).
  function findOwned(req) {
    const v = validator({ ref: req.query.ref ?? req.body?.ref, email: req.query.email ?? req.body?.email });
    v.string('ref', { max: 20 }); v.email('email');
    const d = v.done();
    const b = db.prepare(`${BOOKING_SELECT} WHERE b.ref = ? AND b.customer_email = ?`).get(d.ref.toUpperCase(), d.email);
    if (!b) throw new HttpError(404, 'No booking found for that reference and email');
    return b;
  }
  r.get('/bookings/lookup', writeLimiter, (req, res) => res.json(bookingDto(findOwned(req))));
  r.post('/bookings/cancel', writeLimiter, (req, res) => {
    const b = findOwned(req);
    if (b.status !== 'confirmed') throw new HttpError(409, `Booking is already ${b.status}`);
    if (b.start_date <= todayIso()) throw new HttpError(409, 'Rentals that have started cannot be cancelled online. Please call us.');
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(b.id);
    res.json({ ...bookingDto(b), status: 'cancelled' });
  });

  r.post('/feedback', writeLimiter, (req, res) => {
    const v = validator(req.body);
    v.string('name', { max: 80 }); v.email('email'); v.int('rating', { min: 1, max: 5 });
    v.string('message', { min: 5, max: 1000 }); v.bool('allowPublish');
    const d = v.done();
    db.prepare('INSERT INTO feedback (name, email, rating, message, allow_publish) VALUES (?, ?, ?, ?, ?)').run(d.name, d.email, d.rating, d.message, d.allowPublish ? 1 : 0);
    const preview = config.appEnv === 'dev' && !config.isProd && d.allowPublish;
    res.status(201).json({ ok: true, message: preview
      ? 'Thank you! Your feedback is visible in Dev reviews as Pending approval. PROD publication still requires admin approval.'
      : 'Thank you for your feedback! Publication requires your permission and admin approval.' });
  });

  // Public reviews: top N (home page) or all (reviews page) plus the rating summary.
  r.get('/reviews', (req, res) => {
    const v = validator(req.query);
    const limit = v.int('limit', { min: 1, max: 500, optional: true });
    v.done();
    const devPreview = config.appEnv === 'dev' && !config.isProd;
    res.set('Cache-Control', 'no-store');
    res.json({ ...listReviews(db, { limit, includePending: devPreview }), devPreview, googleUrl: config.business.googleReviewsUrl });
  });

  r.get('/testimonials', (_req, res) => {
    const rows = db.prepare('SELECT name, rating, message FROM feedback WHERE approved = 1 AND allow_publish = 1 ORDER BY id DESC LIMIT 12').all();
    const avg = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM feedback WHERE approved = 1').get();
    res.json({ items: rows, average: avg.avg ? Math.round(avg.avg * 10) / 10 : null, count: avg.cnt });
  });

  return r;
};
