'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin'
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY, make TEXT NOT NULL, model TEXT NOT NULL, year INTEGER NOT NULL,
  category TEXT NOT NULL, body TEXT NOT NULL DEFAULT 'sedan', color TEXT NOT NULL DEFAULT '#6c5ce7',
  transmission TEXT NOT NULL, fuel TEXT NOT NULL, seats INTEGER NOT NULL, bags INTEGER NOT NULL DEFAULT 2,
  price_per_day REAL NOT NULL, deposit REAL NOT NULL DEFAULT 300, description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  brand TEXT NOT NULL DEFAULT '', image TEXT
);
CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, languages TEXT NOT NULL DEFAULT 'English',
  years_experience INTEGER NOT NULL DEFAULT 5, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY, ref TEXT UNIQUE NOT NULL, car_id INTEGER NOT NULL REFERENCES cars(id),
  pickup_location_id INTEGER NOT NULL REFERENCES locations(id), dropoff_location_id INTEGER NOT NULL REFERENCES locations(id),
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, days INTEGER NOT NULL,
  driver_mode TEXT NOT NULL DEFAULT 'self', driver_id INTEGER REFERENCES drivers(id),
  addons TEXT NOT NULL DEFAULT '[]', price_breakdown TEXT NOT NULL, total REAL NOT NULL,
  customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT NOT NULL,
  date_of_birth TEXT, licence_number TEXT, licence_country TEXT, licence_expiry TEXT,
  payment_method TEXT NOT NULL DEFAULT 'pay_at_pickup', notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bookings_car ON bookings(car_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), author TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_car ON reviews(car_id);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL, allow_publish INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Public customer reviews (e.g. imported from the business's Google listing). Deduplicated by content hash.
CREATE TABLE IF NOT EXISTS customer_reviews (
  id INTEGER PRIMARY KEY, author TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT NOT NULL DEFAULT '', review_date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'google', url TEXT,
  hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Additive migration for databases created before brand/image existed.
  const cols = db.prepare('PRAGMA table_info(cars)').all().map((c) => c.name);
  if (!cols.includes('brand')) db.exec("ALTER TABLE cars ADD COLUMN brand TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('image')) db.exec('ALTER TABLE cars ADD COLUMN image TEXT');
  return db;
}

// Run fn inside a write transaction (SQLite access is synchronous, so this doubles as our double-booking guard).
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { openDb, transaction };
