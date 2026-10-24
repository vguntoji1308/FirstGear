'use strict';
const { validator, todayIso } = require('../validate');
const { HttpError } = require('../errors');

function bookingFilters(query) {
  const v = validator(query);
  v.oneOf('period', ['all', 'current', 'past'], { optional: true });
  v.oneOf('status', ['confirmed', 'active', 'completed', 'cancelled'], { optional: true });
  v.int('carId', { min: 1, optional: true });
  v.date('from', { optional: true }); v.date('to', { optional: true });
  const filters = v.done();
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new HttpError(400, 'Validation failed', { to: 'End date must be on or after start date' });
  }
  const conditions = [], params = [];
  const add = (sql, value) => { conditions.push(sql); params.push(value); };
  if (filters.period === 'current') add("b.status IN ('confirmed','active') AND b.end_date >= ?", todayIso());
  if (filters.period === 'past') add("(b.status IN ('completed','cancelled') OR b.end_date < ?)", todayIso());
  if (filters.status) add('b.status = ?', filters.status);
  if (filters.carId) add('b.car_id = ?', filters.carId);
  if (filters.from) add('b.start_date >= ?', filters.from);
  if (filters.to) add('b.start_date <= ?', filters.to);
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function bookingReport(db, scope, { sample = false } = {}) {
  let source = 'bookings', prefix = '', sampleParams = [];
  if (sample) {
    const cars = db.prepare('SELECT id FROM cars ORDER BY active DESC, id LIMIT 5').all();
    if (!cars.length) throw new HttpError(409, 'Add a car before viewing sample trends');
    const year = new Date().getUTCFullYear();
    const rows = [];
    for (let month = 1; month <= 12; month++) {
      cars.forEach((car, index) => {
        const count = 2 + ((month * (index + 1)) % 7) + (cars.length - index);
        for (let n = 0; n < count; n++) {
          const start = `${year}-${String(month).padStart(2, '0')}-${String(1 + n * 2).padStart(2, '0')}`;
          const end = new Date(Date.parse(`${start}T00:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
          const status = n === 0 ? 'cancelled' : end < todayIso() ? 'completed' : start <= todayIso() ? 'active' : 'confirmed';
          rows.push('(?,?,?,?)'); sampleParams.push(car.id, start, end, status);
        }
      });
    }
    // A read-only CTE: sample bookings are never inserted into the user's database.
    prefix = `WITH sample_bookings(car_id,start_date,end_date,status) AS (VALUES ${rows.join(',')}) `;
    source = 'sample_bookings';
  }
  const rows = db.prepare(`${prefix}SELECT substr(b.start_date,1,7) AS month, b.car_id AS carId,
    c.make || ' ' || c.model AS car, b.status, COUNT(*) AS count
    FROM ${source} b JOIN cars c ON c.id = b.car_id ${scope.where}
    GROUP BY month, b.car_id, b.status ORDER BY month, b.car_id`).all(...sampleParams, ...scope.params);
  const months = new Map(), cars = new Map();
  let cancelled = 0, total = 0;
  for (const row of rows) {
    total += row.count;
    if (!months.has(row.month)) months.set(row.month, 0);
    if (!cars.has(row.carId)) cars.set(row.carId, { carId: row.carId, car: row.car, count: 0 });
    if (row.status === 'cancelled') { cancelled += row.count; continue; }
    months.set(row.month, months.get(row.month) + row.count);
    cars.get(row.carId).count += row.count;
  }
  return {
    sample, total, booked: total - cancelled, cancelled,
    months: [...months].map(([month, count]) => ({ month, count })),
    cars: [...cars.values()].sort((a, b) => b.count - a.count || a.carId - b.carId),
  };
}

module.exports = { bookingFilters, bookingReport };
