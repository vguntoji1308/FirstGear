# Architecture

```
Browser (static HTML/CSS/vanilla JS, no build step)
   |  HTTPS (TLS at proxy/platform)
Express app  ── helmet(CSP) ── CORS allow-list ── rate limiters ── JSON body limit
   ├─ /api/*   public routes  (cars, quote, bookings, reviews, feedback, chat)
   ├─ /api/*   admin routes   (JWT bearer, role=admin)
   ├─ services: pricing, availability, chatbot (pluggable)
   └─ static:  /public  (pages + assets)
SQLite file (node:sqlite) at DB_PATH
```

## Stack and why
| Choice | Reason |
|---|---|
| **Node.js 22 + Express** | Mainstream, one language end to end, tiny runtime, trivial to containerise |
| **SQLite via built-in `node:sqlite`** | Zero setup, no native compile, a single file to back up, perfect for one location's volumes. Swap to PostgreSQL if you need multiple instances |
| **Vanilla JS + hand-written CSS, no bundler** | Nothing to build, tiny payload, easy to host on any static/Node host, strict CSP (no inline scripts or styles) |
| **JWT + bcrypt** | Stateless admin auth, passwords hashed (cost 12) |
| **node:test** | No test-framework dependency; 16 tests run in seconds |
| **Docker + two pipeline files** | Same artifact on any host; Azure DevOps and GitHub Actions both supported |

Runtime dependencies: `express`, `helmet`, `cors`, `express-rate-limit`, `jsonwebtoken`, `bcryptjs` only.

## Data model
`locations`, `cars`, `drivers` (chauffeurs), `bookings` (price breakdown stored as JSON snapshot, customer + licence details), `reviews` (per-car ratings), `feedback` (testimonials; `allow_publish` consent + `approved` moderation), `users` (admin).

## Key rules
- **Availability:** ranges are `[start, end)`; return day is free for the next customer. Cars are blocked by `confirmed` and `active` bookings; cancelled/completed free them. Chauffeurs use the same rule per driver; a booking is auto-assigned the first free chauffeur.
- **Atomicity:** booking creation runs in a `BEGIN IMMEDIATE` transaction that re-checks availability, preventing double booking.
- **Pricing (`src/services/pricing.js`):** daily rate x days, 10% discount for 7+ days, chauffeur per day, per-day add-ons (GearPilot bookings cannot take GPS/additional driver), young-driver fee under 25 for self-drive, then tax. The same function backs `/quote` and `/bookings` so shown and charged totals match.
- **Driver validation:** self-drive needs age >= 21 at pick-up, licence number format, licence valid through the return date; chauffeur needs only age >= 18.
- **Guest bookings:** no customer accounts. A booking is viewed/cancelled with reference **and** email (both must match; rate limited).

## Security controls
Strict CSP (self only), Helmet headers, HSTS, no `X-Powered-By`; rate limits (general, write, login); body limit 20 KB; server-side validation of every input with allow-lists; parameterised SQL only; output escaped client-side (`textContent`/escaping helper); admin JWT (HS256, 8h) in `sessionStorage`, constant-time-ish login (dummy hash for unknown users); CORS disabled unless allow-listed; secrets only via env with fail-fast checks in prod; non-root container, read-only filesystem in the prod compose file.

## Chatbot design
`src/chatbot/index.js` defines the contract used by `POST /api/chat`:

```js
bot.reply({ message, history }) -> Promise<{ text, suggestions, handoff, intent? }>
```
`RuleBasedBot` matches intents (hours, fleet, prices, add-ons, chauffeur, booking, cancellation, age/licence, deposit, payment, policies, contact) and reads live data (fleet, prices, locations). Unknown questions and "talk to a human" return `handoff: true`, which shows Call/Email buttons.

**To plug in an LLM:** add `src/chatbot/llm-bot.js` exporting a class with the same `reply()`, build its prompt from business facts (config + DB), keep API keys in env vars, return `{text, suggestions, handoff}`, and add a `case 'llm'` in `createBot`. Keep the rule bot as fallback if the LLM call fails. The front-end needs no change.

## Front-end structure
`public/js/common.js` provides the API client, escaping, icons, generated car art, header/footer, floating call button and chat widget on every page. Each page has one small script (`home.js`, `fleet.js`, `book.js`, `manage.js`, `admin.js`). Accessibility: skip link, landmarks, labelled controls, `aria-live` regions, focus styles, keyboard-usable dialogs and star inputs, `prefers-reduced-motion` honoured.
