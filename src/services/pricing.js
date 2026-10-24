'use strict';
// Pricing rules live here so the quote shown in the UI and the booking total can never diverge.
const round2 = (n) => Math.round(n * 100) / 100;

const ADDONS = {
  insurance: { id: 'insurance', label: 'Full protection cover', description: 'Zero-excess collision and theft cover', price: 500, per: 'day', selfOnly: false },
  child_seat: { id: 'child_seat', label: 'Child seat', description: 'Ages 1-6, fitted at pick-up', price: 150, per: 'day', selfOnly: false },
  gps: { id: 'gps', label: 'GPS navigation', description: 'Offline maps in several languages', price: 200, per: 'day', selfOnly: true },
  wifi: { id: 'wifi', label: 'Mobile Wi-Fi hotspot', description: 'Unlimited data on the road', price: 150, per: 'day', selfOnly: false },
  extra_driver: { id: 'extra_driver', label: 'Additional driver', description: 'Second named driver (licence checked at pick-up)', price: 300, per: 'day', selfOnly: true },
};

function computeQuote({ car, days, driverMode = 'self', addonIds = [], age, rental }) {
  const plural = `${days} day${days > 1 ? 's' : ''}`;
  const lines = [];
  const base = round2(car.price_per_day * days);
  lines.push({ code: 'base', label: `${car.make} ${car.model} x ${plural}`, amount: base });

  if (days >= 7 && rental.weeklyDiscount > 0) {
    lines.push({ code: 'discount', label: `Long-rental discount (${Math.round(rental.weeklyDiscount * 100)}%)`, amount: -round2(base * rental.weeklyDiscount) });
  }
  if (driverMode === 'chauffeur') {
    lines.push({ code: 'chauffeur', label: `Professional chauffeur x ${plural}`, amount: round2(rental.chauffeurDailyRate * days) });
  }
  for (const id of addonIds) {
    const a = ADDONS[id];
    lines.push({ code: id, label: `${a.label} x ${plural}`, amount: round2(a.price * days) });
  }
  if (driverMode === 'self' && age !== undefined && age < rental.youngDriverUnder) {
    lines.push({ code: 'young_driver', label: `Young driver fee x ${plural}`, amount: round2(rental.youngDriverFeePerDay * days) });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round2(subtotal * rental.taxRate);
  lines.push({ code: 'tax', label: `Tax (${round2(rental.taxRate * 100)}%)`, amount: tax });
  return {
    days, lines, subtotal, tax, total: round2(subtotal + tax),
    deposit: driverMode === 'self' ? car.deposit : 0, currency: rental.currency,
  };
}

module.exports = { ADDONS, computeQuote, round2 };
