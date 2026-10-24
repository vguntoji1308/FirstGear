'use strict';
// Fleet imported from the FirstGear demo site (names, seats, transmission, daily price in INR). Photos: the site's own, plus Wikimedia Commons for the rest.
// NOT on the source site, so inferred and editable in /admin: brand, category, body style, fuel, bags, deposit, colour.
const BRANDS = {
  'maruti-suzuki': 'Maruti Suzuki',
  toyota: 'Toyota',
  hyundai: 'Hyundai',
  kia: 'Kia',
  tata: 'Tata',
  mahindra: 'Mahindra',
};

const W = '#e5e7eb', G = '#6b7280', B = '#2563eb', K = '#1f2937', S = '#cbd5e1';
// [sourceId, brand, model, category, body, colour, transmission, fuel, seats, pricePerDay, image]
const ROWS = [
  [40, 'maruti-suzuki', 'Baleno AMT', 'economy', 'hatch', S, 'manual', 'petrol', 5, 3500, 'jpg'],
  [23, 'maruti-suzuki', 'Baleno Master', 'economy', 'hatch', B, 'manual', 'petrol', 5, 2500, 'jpg'],
  [97, 'maruti-suzuki', 'Baleno White', 'economy', 'hatch', W, 'manual', 'petrol', 5, 2500, null],
  [53, 'maruti-suzuki', 'Ciaz', 'compact', 'sedan', B, 'manual', 'petrol', 5, 3500, 'jpg'],
  [120, 'hyundai', 'Creta', 'suv', 'suv', K, 'manual', 'petrol', 5, 4000, 'cc'],
  [45, 'toyota', 'Innova Crysta Grey', 'family', 'suv', G, 'manual', 'diesel', 7, 4500, 'png'],
  [101, 'toyota', 'Innova Crysta', 'family', 'suv', W, 'manual', 'diesel', 7, 5000, null],
  [114, 'maruti-suzuki', 'Dzire', 'compact', 'sedan', W, 'automatic', 'petrol', 5, 3000, null],
  [113, 'maruti-suzuki', 'Ertiga', 'family', 'suv', S, 'manual', 'petrol', 7, 4000, null],
  [84, 'maruti-suzuki', 'Ertiga', 'family', 'suv', W, 'manual', 'petrol', 7, 4000, null],
  [89, 'maruti-suzuki', 'Ertiga', 'family', 'suv', G, 'manual', 'petrol', 7, 4000, null],
  [90, 'maruti-suzuki', 'Ertiga CNG', 'family', 'suv', W, 'manual', 'cng', 7, 4000, null],
  [77, 'maruti-suzuki', 'Ertiga CNG White', 'family', 'suv', W, 'manual', 'cng', 7, 4000, 'png'],
  [67, 'maruti-suzuki', 'Ertiga Grey', 'family', 'suv', G, 'manual', 'petrol', 7, 4500, 'png'],
  [43, 'toyota', 'Glanza White', 'economy', 'hatch', W, 'manual', 'petrol', 5, 2500, 'png'],
  [41, 'toyota', 'Glanza Grey', 'economy', 'hatch', G, 'manual', 'petrol', 5, 2500, 'jpg'],
  [73, 'toyota', 'Glanza', 'economy', 'hatch', S, 'manual', 'petrol', 5, 3000, 'jpg'],
  [116, 'hyundai', 'i10', 'economy', 'hatch', W, 'manual', 'petrol', 5, 2300, 'cc'],
  [63, 'hyundai', 'i20 Blue', 'compact', 'hatch', B, 'manual', 'petrol', 5, 3000, 'png'],
  [56, 'hyundai', 'i20 New', 'compact', 'hatch', W, 'manual', 'petrol', 5, 3500, 'png'],
  [118, 'toyota', 'Innova Crysta', 'family', 'suv', S, 'manual', 'diesel', 7, 5000, null],
  [86, 'toyota', 'Innova Hycross', 'family', 'suv', W, 'automatic', 'hybrid', 8, 8500, 'cc'],
  [28, 'kia', 'Carens', 'family', 'suv', S, 'manual', 'petrol', 7, 4000, 'jpeg'],
  [66, 'kia', 'Carens White', 'family', 'suv', W, 'manual', 'petrol', 7, 4500, 'png'],
  [78, 'maruti-suzuki', 'Dzire New', 'compact', 'sedan', S, 'manual', 'petrol', 5, 3000, 'jpg'],
  [29, 'maruti-suzuki', 'New Swift', 'economy', 'hatch', S, 'manual', 'petrol', 5, 2300, 'png'],
  [103, 'tata', 'Nexon EV', 'electric', 'suv', B, 'manual', 'electric', 5, 4000, null],
  [35, 'mahindra', 'Scorpio N', 'suv', 'suv', W, 'manual', 'diesel', 7, 10000, 'png'],
  [48, 'mahindra', 'Thar', 'suv', 'suv', K, 'manual', 'diesel', 5, 8000, 'png'],
  [121, 'mahindra', 'Thar Roxx', 'suv', 'suv', G, 'manual', 'diesel', 5, 7500, null],
  [95, 'mahindra', 'Thar Roxx Black', 'suv', 'suv', K, 'manual', 'diesel', 5, 10000, null],
  [60, 'hyundai', 'Venue', 'suv', 'suv', B, 'manual', 'petrol', 5, 3000, 'png'],
  [36, 'mahindra', 'XUV300 AMT', 'suv', 'suv', '#14b8a6', 'automatic', 'petrol', 5, 4000, 'png'],
  [34, 'mahindra', 'XUV700', 'suv', 'suv', S, 'manual', 'diesel', 7, 7500, 'jpg'],
];

const deposit = (price) => (price <= 3000 ? 5000 : price <= 5000 ? 10000 : 25000);
const FEATURES = {
  petrol: ['Air conditioning', 'Music system', 'Insurance included'],
  diesel: ['Air conditioning', 'Music system', 'Insurance included'],
  cng: ['Air conditioning', 'CNG economy', 'Insurance included'],
  hybrid: ['Air conditioning', 'Hybrid efficiency', 'Insurance included'],
  electric: ['Air conditioning', 'Zero tailpipe emissions', 'Insurance included'],
};

const CARS = ROWS.map(([sourceId, brand, model, category, body, color, transmission, fuel, seats, price, ext]) => ({
  sourceId, brand, make: BRANDS[brand], model, category, body, color, transmission, fuel, seats,
  bags: body === 'hatch' ? 2 : body === 'sedan' ? 3 : 4,
  pricePerDay: price, deposit: deposit(price),
  description: `${BRANDS[brand]} ${model}: ${seats}-seater ${transmission} ${fuel} car.`,
  features: FEATURES[fuel],
  image: `/img/cars/${sourceId}.webp`, // transparent cut-out (background removed); see public/credits.html for photo credits
}));

module.exports = { BRANDS, CARS };
