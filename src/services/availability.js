'use strict';
// A date range is [start, end): the return day is free for the next customer.
const BLOCKING = "('confirmed','active')";

function carIsAvailable(db, carId, start, end) {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM bookings
    WHERE car_id = ? AND status IN ${BLOCKING} AND start_date < ? AND end_date > ?`).get(carId, end, start);
  return row.c === 0;
}

function unavailableCarIds(db, start, end) {
  return new Set(db.prepare(`SELECT DISTINCT car_id FROM bookings
    WHERE status IN ${BLOCKING} AND start_date < ? AND end_date > ?`).all(end, start).map((r) => r.car_id));
}

function freeDriver(db, start, end) {
  return db.prepare(`SELECT * FROM drivers d WHERE d.active = 1 AND NOT EXISTS (
    SELECT 1 FROM bookings b WHERE b.driver_id = d.id AND b.status IN ${BLOCKING} AND b.start_date < ? AND b.end_date > ?)
    ORDER BY d.id LIMIT 1`).get(end, start);
}

function driversFreeCount(db, start, end) {
  return db.prepare(`SELECT COUNT(*) AS c FROM drivers d WHERE d.active = 1 AND NOT EXISTS (
    SELECT 1 FROM bookings b WHERE b.driver_id = d.id AND b.status IN ${BLOCKING} AND b.start_date < ? AND b.end_date > ?)`).get(end, start).c;
}

module.exports = { carIsAvailable, unavailableCarIds, freeDriver, driversFreeCount };
