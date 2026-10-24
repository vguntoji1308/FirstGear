# API reference

Base path `/api`. JSON in/out. Errors: `{ "error": "message", "details": { "field": "reason" } }` (details only on validation errors).
Status codes: 400 validation, 401/403 auth, 404 not found, 409 conflict (availability), 413 too large, 429 rate limited.

## Public

| Method & path | Description |
|---|---|
| `GET /health` | `{status, env, time}` for probes |
| `GET /config` | Public business info (phone, socials), rental rules, add-on catalog, categories |
| `GET /locations` | Pick-up/drop-off locations |
| `GET /cars` | Fleet. Query: `category, brand (maruti-suzuki, toyota, hyundai, kia, tata, mahindra), transmission, fuel (petrol, diesel, hybrid, electric, cng), seats (min), minPrice, maxPrice, q, sort (price_asc, price_desc, rating, newest), start, end (adds `available`), availableOnly=true` |
| `GET /cars/:id` | Car + rating `{average,count}` + latest reviews |
| `POST /cars/:id/reviews` | `{rating 1-5, author, comment?}` → new average. Rate limited |
| `GET /availability/driver?start&end` | `{available, driversFree, dailyRate}` |
| `POST /quote` | Price a trip (no customer data). Body below. Returns `{lines[], subtotal, tax, total, deposit, carAvailable, driverAvailable}` |
| `POST /bookings` | Create booking. Returns booking incl. `ref` (e.g. `FG-1A2B3C4D`). 409 if car/chauffeur unavailable |
| `GET /bookings/lookup?ref&email` | View a booking (both must match) |
| `POST /bookings/cancel` | `{ref, email}`; only `confirmed` bookings starting after today |
| `POST /feedback` | `{name, email, rating, message, allowPublish}`; stored in SQLite. Consented feedback appears immediately in Dev reviews labelled pending approval; PROD and testimonials still require admin approval |
| `GET /testimonials` | Approved, consented testimonials + average |
| `GET /reviews?limit=5` | Imported Google reviews + consented website feedback, newest first, with `summary {average, count, distribution, demo}`, `devPreview`, item `pendingApproval` and `googleUrl`. Dev includes pending feedback in items/summary; other environments require approval. Omit `limit` for all; supplied limit must be 1-500 |
| `POST /chat` | `{message}` → `{text, suggestions[], handoff, intent}` |

### Optional customer phone accounts

Guest booking remains available. These endpoints use Twilio Verify, not the admin password/JWT.
Use E.164 numbers, e.g. `+919876543210`. Never put Twilio credentials in the browser.

| Method & path | Description |
|---|---|
| `POST /customer/otp/request` | JSON `{phone}`. Sends SMS through Twilio Verify; returns `{challengeId,expiresIn:600,retryAfter:60,message}`. Missing credentials: 503 (no fake success). Limit 5 sends/phone/hour, 60-second cooldown, 10 sends/IP/15 minutes |
| `POST /customer/otp/verify` | JSON `{challengeId,code}`. Maximum 5 attempts/challenge and 30 checks/IP/15 minutes. Existing customer: `{needsRegistration:false,token,customer}`. New phone: `{needsRegistration:true,registrationToken}`. OTP challenges expire after 10 minutes, are single-use and are superseded by a new request |
| `POST /customer/register` | `Authorization: Bearer <registrationToken>` (expires after 15 minutes). **multipart/form-data**, fields `name` (2-80 characters), `consent=true`, and one driving-licence image named `licence` (required for every new registration). Image bytes must be <=10,485,760, decoded pixels <=25 million. Creates account and returns `{token,customer}` with HTTP 201. Up to 5 requests/IP/15 minutes |
| `GET /customer/me` | Customer login bearer token required. Returns `{id,phone,name,licenceMime,licenceBytes,createdAt}` without the image |
| `GET /customer/licence` | Customer login bearer token required; downloads only that customer's private driving-licence WebP image with no-store caching |
| `POST /customer/logout` | Customer login bearer token required; revokes this session and returns `{ok:true}` |

Customer login tokens expire after 8 hours and are stored as hashes in SQLite.
Registration tokens are single-use and cannot read profiles/licence images; customer tokens cannot
access admin APIs. Supported upload formats: JPEG, PNG, WebP, GIF, TIFF and AVIF
(codec support is validated by the server). The server decodes actual bytes, applies orientation,
strips metadata and stores WebP. Animations use the first frame. SVG, PDF/Word, corrupt files,
unsupported codecs and oversize images are rejected. All customer API responses are no-store.
Driving-licence images are stored as private SQLite BLOBs, never under `public`.
Existing SQLite columns `resume` and `resume_mime` are retained for data compatibility;
they now hold the driving-licence image. Uploading does not verify document authenticity,
ownership or validity, and does not replace the existing self-drive booking checks.

### Trip body (`/quote`, `/bookings`)
```json
{
  "carId": 2, "pickupLocationId": 1, "dropoffLocationId": 2,
  "start": "2026-11-10", "end": "2026-11-13",
  "driverMode": "self | chauffeur",
  "addons": ["insurance", "child_seat", "gps", "wifi", "extra_driver"],
  "dateOfBirth": "1990-05-20"
}
```
`/bookings` additionally requires: `customerName, customerEmail, customerPhone, dateOfBirth, acceptTerms: true`, and for `self`: `licenceNumber, licenceCountry, licenceExpiry`; optional `paymentMethod (pay_at_pickup | pay_online_demo)`, `notes`.
Dates are `YYYY-MM-DD`; the return date is exclusive; max rental length is `MAX_RENTAL_DAYS`.
Date of birth must be on or after the date 80 calendar years before today (UTC), for both
self-drive and chauffeur bookings and for quotes supplying a DOB. Licence expiry for self-drive
must be after the return date and on or before the date 20 calendar years from today.
Both boundary dates are inclusive; February 29 boundaries clamp to February 28 in non-leap years.
`GET /config` exposes `rental.earliestDateOfBirth` and `rental.latestLicenceExpiry` for calendar limits.

## Admin (Authorization: `Bearer <token>`)

| Method & path | Description |
|---|---|
| `POST /auth/login` | `{email, password}` → `{token, user}` (rate limited) |
| `GET /admin/summary` | KPIs |
| `GET /admin/cars` | All fleet records, including inactive cars; admin DTO uses database field names such as `price_per_day` |
| `POST /admin/cars` | Create a car; returns `{id}`. Body below |
| `PUT /admin/cars/:id` | Replace car fields using the full create body; optional `active: false` hides it |
| `DELETE /admin/cars/:id` | Hide a car (soft delete; history kept) |
| `GET /admin/bookings` | Latest 500 matching bookings. Optional `period=all|current|past`, `carId`, `status`, `from`, `to`. Dates are inclusive pickup dates (`YYYY-MM-DD`). Current: confirmed/active with return date today or later; Past: completed/cancelled or return date before today (UTC) |
| `GET /admin/bookings/trends` | Same filters; aggregates **all** matching rows, not just the latest 500. Returns `{sample,total,booked,cancelled,months:[{month,count}],cars:[{carId,car,count}]}`. Charts exclude cancelled bookings; months use pickup dates and omit months with no records. Cars sorted by frequency. `dataset=sample` is Dev-only, synthetic current-year data generated without inserting bookings; default `dataset=live` |
| `PATCH /admin/bookings/:id` | `{status: confirmed|active|completed|cancelled}` |
| `GET /admin/drivers` | All chauffeurs |
| `POST /admin/drivers` | `{name, languages, yearsExperience}`; returns `{id}` |
| `PATCH /admin/drivers/:id` | `{active: boolean}` |
| `GET /admin/feedback` | Latest 200 feedback entries, including unapproved |
| `PATCH /admin/feedback/:id` | `{approved: boolean}` |
| `DELETE /admin/feedback/:id` | Delete feedback |
| `GET /admin/reviews` | Latest 200 per-car ratings |
| `DELETE /admin/reviews/:id` | Delete a per-car rating |
| `POST /admin/reviews/import` | `{reviews: [{author, rating, text?, date?, url?}], replace?: boolean}` (1-500). Duplicates skipped; returns `{added, skippedDuplicates}` |

### Full car create/update body

```json
{
  "brand": "kia", "make": "Kia", "model": "Demo Car", "year": 2026,
  "category": "suv", "body": "suv", "color": "#112233",
  "transmission": "automatic", "fuel": "petrol", "seats": 5, "bags": 3,
  "pricePerDay": 3000, "deposit": 5000, "description": "Demo vehicle",
  "features": ["Air conditioning"], "image": "/img/cars/demo.webp"
}
```

Use catalogs from `GET /config` for brands/categories. Bodies: `hatch, sedan, suv, sports, van`.
Image is optional; a provided path must point to an image file already deployed in `public/img/cars/`.
There is no file-upload API. The create body uses camelCase; do not send an admin GET response back unchanged.

### Complete self-drive booking body

Choose actual IDs from `GET /cars` and `GET /locations`, and replace dates with future dates.

```json
{
  "carId": 2,
  "pickupLocationId": 1,
  "dropoffLocationId": 1,
  "start": "2026-11-10",
  "end": "2026-11-13",
  "driverMode": "self",
  "addons": ["insurance"],
  "customerName": "Demo Customer",
  "customerEmail": "demo@example.com",
  "customerPhone": "+91 90000 00000",
  "dateOfBirth": "1990-05-20",
  "licenceNumber": "DEMO-12345",
  "licenceCountry": "India",
  "licenceExpiry": "2030-12-31",
  "paymentMethod": "pay_at_pickup",
  "acceptTerms": true
}
```

Call `POST /quote` with the trip fields first, then `POST /bookings` with the full body.
Save the returned `ref`. Look up using `GET /bookings/lookup?ref=FG-...&email=demo%40example.com`.
Cancel using `POST /bookings/cancel` with `{"ref":"FG-...","email":"demo@example.com"}`.
Cancellation requires a confirmed booking starting after today. URL-encode query values.
For chauffeur bookings, change `driverMode` to `chauffeur`, omit licence fields, and use only
add-ons without `selfOnly: true` from `/config`.

`pay_online_demo` does not process payments. Booking creation immediately confirms the booking;
no email or SMS is sent. Do not put real customer or licence details into a publicly shared Dev environment.

### Limits and missing data-entry APIs

Bodies are limited to 20 KB, including review imports (even though imports allow up to 500 entries).
Guest writes, booking lookups, login and chat are rate limited; handle `429` and its retry headers.
There are no APIs to create/update locations, manage admin accounts/passwords, upload photos,
process payments or send booking notifications. Locations are currently seeded in `src/seed.js`.

## Examples

On Windows, open the Dev-only `/docs` tab for a runnable PowerShell example that discovers IDs
and uses relative future dates. The following shell examples require Bash and future dates:
```bash
curl localhost:3000/api/cars?fuel=electric
curl -X POST localhost:3000/api/quote -H 'Content-Type: application/json' \
  -d '{"carId":2,"pickupLocationId":1,"dropoffLocationId":1,"start":"2026-11-10","end":"2026-11-13","addons":["insurance"]}'
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@localhost.test","password":"..."}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/admin/summary
```
