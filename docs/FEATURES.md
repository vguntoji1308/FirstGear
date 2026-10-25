# Features, extras and Luxerra-inspired ideas

## Calendars and booking status
- Home, Fleet and Booking use a locally served Flatpickr calendar with month/year navigation, keyboard controls and dark/light theme styling. Display dates use `DD Mon YYYY`; submitted API dates remain `YYYY-MM-DD`.
- Existing minimum/maximum date rules still apply, including date of birth and licence expiry. Booking badges use green for confirmed, blue for active, muted grey for completed and red for cancelled, with readable text labels in both themes.
- DOB cannot be earlier than 80 calendar years before today; self-drive licence expiry cannot exceed 20 calendar years from today. These inclusive UTC limits apply in the calendars and API.

The top navigation keeps its original compact style with a mild gold active-tab background and tracks the current
page or home-page section as you scroll. Desktop tabs remain visible above 1040px. Smaller
screens use a scrollable menu that closes after selection, an outside click or Escape.
The home-page Fleet and Customer reviews sections highlight the Fleet and Reviews tabs respectively,
while those tabs continue to open their dedicated pages.
Mobile layouts stack search/date fields and booking details, use touch-sized controls and
avoid squeezed cards. SDLC Studio remains a separate Dev tool at `/sdlc`, not a customer tab.
The home page uses compact 24-36px section padding, smaller heading/card gaps and a
content-sized hero instead of a full-screen minimum, reducing scrolling without hiding content.
The hero image area cycles through the Thar and up to five distinct higher-priced fleet models,
with full-size images and circular position dots instead of arrows or a numeric counter.
It advances automatically every two seconds with slow 1.8-second transitions and no pause button.
Hovering over the car image pauses rotation; leaving resumes it. Keyboard focus, a hidden
browser tab and reduced-motion preferences also pause rotation for accessibility.
Contact details share one desktop row, followed by a full-width answer/call/chat banner.
They stack on smaller screens. Social links remain in Contact only; footer hours and social
links are removed.

## Content imported from the FirstGear demo site
- **34 cars** from the site's car list: name, seats, transmission and daily price in INR. Registration numbers from the source were deliberately not imported.
- **Photos for every car, with transparent backgrounds:** 20 come from the source site and 14 are Wikimedia Commons photos (credited on `/credits` and in `docs/IMAGE_CREDITS.md`) for the cars the source had no image for. All were cut out with an offline background-removal model and saved as transparent WebP in `public/img/cars/<id>.webp` (about 2.7 MB total). Several listings share a model, so some cars reuse a similar photo in a different angle or colour.
- **Car images:** shown as clean transparent cut-outs (no tilt or watermark on the images).
- **FirstGear logo** (supplied by the owner; original kept in `assets-src/firstgear-logo-original.webp`). Transparent versions are in `public/img/firstgear-logo.webp` (light theme) and `firstgear-logo-dark.webp` (dark theme, with the GEAR lettering and tagline in pure white); the favicon and the F&G page watermark are cut from the same logo, business name, phone `+91 96533 13974`, email and Coimbatore address.
- **Brand logos**: the compact home-page brand strip uses locally served manufacturer marks from Simple Icons 16.0.0 with names and links to filtered cars (Suzuki mark for Maruti Suzuki). Sources and trademark notice are on `/credits` and in `docs/IMAGE_CREDITS.md`. Existing car-card badges remain original stand-ins.
- **EV discovery**: a compact "Skip the pump. Keep the adventure." banner promotes the fleet's Tata Nexon EV and links directly to electric-only cars sorted by daily price. It avoids guaranteed savings claims and reminds users to consider charging tariffs, distance and charging stops.
- **Inferred, not on the source site (edit in /admin):** brand, category, body style, fuel (CNG for the two Ertiga CNG listings, EV for Nexon EV, hybrid for Hycross, diesel for Crysta/Innova Crysta/Scorpio N/Thar/XUV700, otherwise petrol), bags, deposit, colour and descriptions.
- **Placeholders:** pick-up points around Coimbatore, opening hours, chauffeur names, demo reviews/testimonials (dev only), tax rate (5%), add-on and chauffeur prices in INR, and social links.
- Source quirks kept as-is: transmission shows "Manual" for AMT variants and the Nexon EV, as listed on the site. Duplicate listings (e.g. three Glanza, several Ertiga) are kept as separate cars, as on the source.

## Customer reviews
- `/reviews` defaults to live Google Places reviews, highest rating first, with reviewer attribution links and no database persistence. Google supplies up to five selected reviews, not the full listing. Website feedback and historical imports remain in a separate view. Configure Google credentials as described in `docs/GOOGLE_REVIEWS.md`.
- The Reviews navigation tab opens `/reviews`. Consented website feedback appears immediately in Dev with a **Pending approval (Dev only)** label; PROD still requires admin approval. Feedback without publishing consent is never included. The home list refreshes after submission; the full page has a Refresh reviews button for API testing. Dev rating summaries include pending feedback. Reviews persist in SQLite (`feedback` for website feedback, `customer_reviews` for Google imports, `reviews` for per-car ratings). Per-car ratings remain separate from business reviews and are returned by `GET /api/cars/:id`.
- Home page shows the **5 most recent reviews** in coloured cards with a **View all reviews** button and a **See us on Google** link. `/reviews` lists every review with the rating breakdown (click a bar to filter by stars) and a **Move to top** button on each review.
- **Highlighted words:** praise (green), service (amber), price (blue) and car (violet) words such as *polite*, *spotless*, *on time*, *value for money* are highlighted automatically; a colour key is shown on `/reviews`.
- **Real Google reviews:** either paste them in **Admin > Import reviews** (JSON), or run the optional `npm run reviews:sync` which pulls the latest 5 through Google's official Places API using your own key and place ID (see `docs/GOOGLE_REVIEWS.md`, including Google's terms). The seeded sample reviews disappear as soon as one real review exists. Importing again skips duplicates.

## Admin bookings and trends
- On the admin portal only, the header's **My booking** link becomes **Bookings**. The customer lookup page is unchanged.
- **Bookings** supports All, Current and Past, car selection (including hidden cars) and inclusive pickup-date From/To filters. Current includes confirmed/active rentals returning today or later. Past includes completed/cancelled rentals or a return date before today, using UTC. Apply filters to refresh; Reset clears them. The table shows the latest 500 matching bookings.
- **Booking dashboard** uses the same filters and shows monthly booking bars, a ranked car-frequency bar chart and the most frequently booked car (ties labelled). All matching records contribute, independently of the table's 500-row limit. Cancelled bookings are counted separately and excluded from chart counts. Months are pickup months, not reservation-creation months; months with no matching records are omitted.
- In Dev, choose **Sample data** and Apply filters to preview a current-year trend across up to five cars. Synthetic rows exist only during the report query: no test bookings are saved and real top-level KPIs are unchanged. Switch back to Real bookings to see SQLite data. The sample API is unavailable outside Dev, including PROD.

## Optional customer phone accounts
- **Sign in / Account** opens `/account`. Real SMS OTPs use Twilio Verify; credentials are configured server-side (see Local setup). Missing configuration is an explicit error, not a demo OTP.
- Every new phone registration requires a name, a driving-licence **image up to 10 MB** and private storage consent. This is for self-drive rentals, not a resume/CV. Common raster formats (JPEG, PNG, WebP, GIF, TIFF, AVIF) are decoded, checked against a 25-megapixel limit and converted to metadata-free WebP. The owner can download the image after signing in. Images are private SQLite BLOBs, not public files. Uploading does not verify licence authenticity or validity and does not replace self-drive booking checks.
- OTP expiry, phone/IP rate limits, retry cooldowns, check-attempt limits, single-use registration tokens and revocable 8-hour customer sessions apply. Phone credentials are separate from staff admin access.
- Guest booking and reference/email lookup remain unchanged; accounts do not automatically link historical bookings. No real SMS was sent by the automated tests.
- Licence authenticity and validity are checked manually by staff at car handover, not automatically from the uploaded image. Image format/size checks and existing booking date rules remain unchanged.

## Requested features (all implemented)
Responsive hi-fi UI; fleet catalog with filters; availability search by dates/location; pricing and add-ons; booking, checkout and confirmation; rental terms; licence and age validation; admin management; input validation; security basics; accessibility and SEO basics; social links and contact section with icons; feedback form + testimonials; per-car star ratings (average + submit); GearPilot booking with price and availability; rule-based chatbot with human fallback; click-to-call on every page; Dev/PROD env files; Azure DevOps + GitHub Actions pipelines with PROD approval; docs; Dockerfile and compose.

## Inspired by the Luxerra reference (look-and-feel only; all code, copy and art are original)
- Dark premium theme with gold/violet gradient accents and large bold hero typography
- Hero with a search card (locations, dates, driving option) floating over an animated gradient/grid background and a floating car illustration
- Stats strip overlapping the hero
- Fleet showcase cards with colour-tinted glow, hover lift and zoom
- Scrolling brand marquee between sections
- Scroll-reveal animations and staggered entrances
- Dedicated **Rental terms** section as an accordion with plain-language summaries
- Testimonial cards with a large aggregate rating
- "How it works" numbered steps
- Sticky translucent navigation that blurs on scroll

## Extras added beyond the request
- Live **price summary** while booking (updates as dates, car, driver mode and add-ons change); shown and charged totals share one pricing function
- Long-rental discount (7+ days) and young-driver fee, applied automatically
- Chauffeur availability checker on the home page and inside the booking flow; chauffeurs auto-assigned to bookings
- Guest **My booking** page: look up and cancel with reference + email
- Admin KPIs, chauffeur management, moderation of testimonials and ratings, soft-delete of cars
- Consent-based testimonials: published only with customer permission and admin approval
- Floating **Call us 24/7** pill and header phone link on every page, plus a chat widget with suggestion chips and Call/Email hand-off buttons
- Environment badge in non-prod, demo data only in dev, fail-fast production configuration checks
- Double-booking protection via transactional re-check; GearPilot bookings reject self-drive-only add-ons (GPS, additional driver)
- Dockerfile with non-root user and healthcheck, hardened prod compose (read-only FS, dropped capabilities)
- ManualValidation gate **and** environment approval for PROD in Azure DevOps
- `robots.txt`, `sitemap.xml`, meta/OpenGraph tags, custom 404, reduced-motion support

## Not included (deliberate, easy next steps)
Real payment gateway (a clearly-labelled demo option exists), outbound booking email/SMS confirmations (phone-login OTPs are separate), multi-language UI, image upload for cars (art is generated from body style and colour), LLM-backed chatbot (interface is ready).
