'use strict';
// Seeds reference data on first run (empty DB only) and ensures the admin user exists.
const bcrypt = require('bcryptjs');
const { CARS } = require('./catalog');

// Pick-up points are PLACEHOLDERS around Coimbatore: edit/replace them to match real locations.
const LOCATIONS = [
  ['FirstGear Office, Kalapatti', 'No 51/A, Ganesh Nagar, Veeriyampalayam Road, Kalapatti Post, Coimbatore 641048'],
  ['Coimbatore International Airport', 'Airport Road, Peelamedu, Coimbatore'],
  ['Coimbatore Junction Railway Station', 'Station Road, Coimbatore'],
  ['Gandhipuram Central Bus Stand', 'Gandhipuram, Coimbatore'],
];

// Placeholder chauffeurs.
const DRIVERS = [
  ['Murugan S.', 'Tamil, English', 12],
  ['Karthik R.', 'Tamil, English, Hindi', 9],
  ['Selvam P.', 'Tamil, Malayalam, English', 7],
];

const DEMO_REVIEWS = [ // [car sourceId, rating, author, comment]
  [40, 5, 'Arun K.', 'Clean car and a smooth pick-up. Great for city trips.'],
  [40, 4, 'Divya R.', 'Good mileage and well maintained.'],
  [77, 5, 'Suresh M.', 'CNG Ertiga was perfect for our family trip to Ooty.'],
  [34, 5, 'Vikram S.', 'XUV700 was comfortable on the long highway drive.'],
  [48, 5, 'Rahul P.', 'The Thar made the weekend. Handles hills beautifully.'],
  [29, 4, 'Meena T.', 'Easy to drive and very economical.'],
  [86, 5, 'Anitha G.', 'Hycross with a driver for the wedding. Excellent service.'],
  [103, 4, 'Karan J.', 'Smooth EV, we only wished for more charging info.'],
];

// [name, message, rating, date] - demo-only; hidden as soon as real reviews are imported.
const DEMO_TESTIMONIALS = [
  ['Arun K.', 'Booking was quick and the car was spotless. Staff answered every call, even late at night.', 5, '2026-10-18'],
  ['Suresh M.', 'Transparent pricing with no surprises at pick-up. Will rent again for our next family trip.', 5, '2026-10-12'],
  ['Anitha G.', 'We booked a car with a GearPilot driver for a wedding and everything ran on time.', 5, '2026-10-05'],
  ['Vikram S.', 'Wide choice of SUVs and MUVs at fair daily rates.', 4, '2026-09-28'],
  ['Divya R.', 'Very polite team and a smooth, hassle-free pick-up. The Baleno was clean and fuel efficient.', 5, '2026-09-20'],
  ['Karthik P.', 'Good value for money and the car was in great condition. Only wished the return was a little faster.', 4, '2026-09-11'],
  ['Meena T.', 'Affordable rates and on-time delivery. Highly recommended for airport trips.', 5, '2026-09-02'],
  ['Rahul V.', 'The Thar was amazing on the hills. Friendly staff and no hidden charges.', 5, '2026-08-24'],
];

function seed(db, config) {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM cars').get();
  if (c === 0) {
    const insLoc = db.prepare('INSERT INTO locations (name, address) VALUES (?, ?)');
    LOCATIONS.forEach((l) => insLoc.run(...l));
    const insCar = db.prepare(`INSERT INTO cars (make, model, year, category, body, color, transmission, fuel, seats, bags,
      price_per_day, deposit, description, features, brand, image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const ids = new Map();
    for (const car of CARS) {
      const info = insCar.run(car.make, car.model, new Date().getFullYear(), car.category, car.body, car.color, car.transmission, car.fuel,
        car.seats, car.bags, car.pricePerDay, car.deposit, car.description, JSON.stringify(car.features), car.brand, car.image);
      ids.set(car.sourceId, Number(info.lastInsertRowid));
    }
    const insDrv = db.prepare('INSERT INTO drivers (name, languages, years_experience) VALUES (?, ?, ?)');
    DRIVERS.forEach((d) => insDrv.run(...d));
    if (config.seedDemoData) {
      const insRev = db.prepare('INSERT INTO reviews (car_id, rating, author, comment) VALUES (?, ?, ?, ?)');
      DEMO_REVIEWS.forEach(([sid, r, a, t]) => insRev.run(ids.get(sid), r, a, t));
      const insFb = db.prepare("INSERT INTO feedback (name, email, rating, message, allow_publish, approved, created_at) VALUES (?, 'demo@example.com', ?, ?, 1, 1, ?)");
      DEMO_TESTIMONIALS.forEach(([n, m, r, d]) => insFb.run(n, r, m, d + ' 10:00:00'));
    }
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(config.adminEmail.toLowerCase());
  if (!existing) {
    db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(config.adminEmail.toLowerCase(), 'Administrator', bcrypt.hashSync(config.adminPassword, 12), 'admin');
  }
}

module.exports = { seed };
