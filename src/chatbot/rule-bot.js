'use strict';
// Keyword/intent FAQ bot. Facts come from config + live DB so answers never go stale.
const { ADDONS } = require('../services/pricing');

const DEFAULT_SUGGESTIONS = ['Working Hours', 'What cars do you have?', 'Prices', 'Book a GearPilot', 'Talk to a human'];

class RuleBasedBot {
  constructor({ db, config }) {
    this.db = db; this.config = config;
    const money = (n) => `${config.rental.currencySymbol}${n}`;
    const b = config.business, r = config.rental;
    // Order matters: first matching intent wins. Each has keyword regexes and an answer function.
    this.intents = [
      { name: 'human', match: /\b(human|agent|person|representative|operator|speak|talk to|call me|complain|complaint|refund)\b/,
        answer: () => ({ text: `Of course. Call us on ${b.phone} (${b.supportNote}) or email ${b.email} and a person will pick it up.`, handoff: true }) },
      { name: 'greeting', match: /^(hi|hello|hey|good (morning|afternoon|evening)|hola)\b/,
        answer: () => ({ text: `Hi! I'm the ${b.name} assistant. I can help with fleet, prices, booking, GearPilot and policies.` }) },
      { name: 'hours', match: /\b(hours?|open|opening|close|closing|when are you)\b/,
        answer: () => ({ text: `Our desks are open ${b.hours}. ${b.supportNote}` }) },
      { name: 'contact', match: /\b(phone|number|email|address|where|location|contact|find you|office)\b/,
        answer: () => ({ text: `Phone: ${b.phone}. Email: ${b.email}. Address: ${b.address}. ${this.locations()}` }) },
      { name: 'driver', match: /\b(gearpilot|pilot|chauffeur|driver|driven|with a driver|book a driver)\b/,
        answer: () => ({ text: `You can add a professional GearPilot driver to any car for ${money(r.chauffeurDailyRate)}/day, or book one instead of driving yourself. GearPilot bookings need no licence from you (minimum age ${r.minChauffeurAge}). Pick "GearPilot" in the booking step to see live availability.`, suggestions: ['How do I book?', 'Prices'] }) },
      { name: 'fleet', match: /\b(cars?|fleet|vehicles?|models?|suv|electric|luxury|van|available)\b/,
        answer: () => ({ text: this.fleetSummary(), suggestions: ['Prices', 'How do I book?'] }) },
      { name: 'price', match: /\b(price|prices|pricing|cost|how much|rate|rates|cheap|cheapest|deal|discount)\b/,
        answer: () => ({ text: this.priceSummary(), suggestions: ['What add-ons are there?', 'Deposit'] }) },
      { name: 'addons', match: /\b(add-?ons?|extras?|insurance|child seat|gps|wifi|wi-fi|baby)\b/,
        answer: () => ({ text: `Add-ons per day: ${Object.values(ADDONS).map((a) => `${a.label} ${money(a.price)}`).join(', ')}.` }) },
      { name: 'booking', match: /\b(book|booking|reserve|reservation|how do i|how to|checkout)\b/,
        answer: () => ({ text: 'Booking takes 3 steps: 1) choose dates and locations on the home page, 2) pick a car, driver option and add-ons, 3) enter your details and confirm. You will get a reference like FG-XXXXXXXX. You can look up or cancel it from the "My booking" page with your reference and email.', suggestions: ['Cancellation policy', 'Age and licence'] }) },
      { name: 'cancel', match: /\b(cancel|cancellation|change my booking|modify|amend)\b/,
        answer: () => ({ text: `Cancel free of charge up to ${r.freeCancellationHours} hours before pick-up from the "My booking" page, or call ${b.phone}. Later changes are at our discretion.` }) },
      { name: 'age', match: /\b(age|old|licen[cs]e|young|over 21|under 25|id)\b/,
        answer: () => ({ text: `Self-drive: drivers must be ${r.minDriverAge}+ and hold a full licence valid through the return date. Drivers under ${r.youngDriverUnder} pay a young driver fee of ${money(r.youngDriverFeePerDay)}/day. With a GearPilot driver there is no licence requirement.` }) },
      { name: 'deposit', match: /\b(deposit|hold|excess|pre-?auth)\b/,
        answer: () => ({ text: 'A refundable security deposit (from the fleet page, depends on the car) is held at pick-up for self-drive rentals. GearPilot bookings need no deposit.' }) },
      { name: 'payment', match: /\b(pay|payment|card|cash|paypal)\b/,
        answer: () => ({ text: 'You can choose to pay at pick-up when booking. We accept major credit and debit cards at the desk.' }) },
      { name: 'policy', match: /\b(policy|policies|terms|fuel|mileage|km|miles|smok|pets?|border|abroad|late return|return)\b/,
        answer: () => ({ text: 'Highlights: full-to-full fuel, 250 km/day included, no smoking, pets by request, late returns are charged per hour. The full "Rental terms" section is on the home page.' }) },
      { name: 'thanks', match: /\b(thanks|thank you|cheers|great)\b/, answer: () => ({ text: "You're welcome! Anything else I can help with?" }) },
    ];
  }

  locations() {
    const rows = this.db.prepare('SELECT name FROM locations WHERE active = 1 ORDER BY id').all();
    return rows.length ? `Pick-up points: ${rows.map((l) => l.name).join(', ')}.` : '';
  }

  fleetSummary() {
    const rows = this.db.prepare('SELECT category, COUNT(*) AS n, MIN(price_per_day) AS min FROM cars WHERE active = 1 GROUP BY category ORDER BY min').all();
    if (!rows.length) return 'Our fleet is being updated. Please call us for availability.';
    const s = this.config.rental.currencySymbol;
    return `We have ${rows.reduce((t, r) => t + r.n, 0)} cars: ${rows.map((r) => `${r.category} (${r.n}, from ${s}${r.min}/day)`).join(', ')}. See the Fleet page to filter by seats, fuel or transmission.`;
  }

  priceSummary() {
    const row = this.db.prepare('SELECT MIN(price_per_day) AS min, MAX(price_per_day) AS max FROM cars WHERE active = 1').get();
    const r = this.config.rental, s = r.currencySymbol;
    return `Daily rates run from ${s}${row.min} to ${s}${row.max} before tax (${Math.round(r.taxRate * 100)}%). Rentals of 7+ days get ${Math.round(r.weeklyDiscount * 100)}% off. A GearPilot driver is ${s}${r.chauffeurDailyRate}/day.`;
  }

  async reply({ message }) {
    const text = String(message || '').toLowerCase().trim();
    for (const intent of this.intents) {
      if (intent.match.test(text)) {
        const out = intent.answer();
        return { text: out.text, suggestions: out.suggestions || DEFAULT_SUGGESTIONS, handoff: !!out.handoff, intent: intent.name };
      }
    }
    const b = this.config.business;
    return {
      text: `I'm not sure about that one. A person can help: call ${b.phone} (any time for urgent requests) or email ${b.email}.`,
      suggestions: DEFAULT_SUGGESTIONS, handoff: true, intent: 'fallback',
    };
  }
}

module.exports = { RuleBasedBot };
