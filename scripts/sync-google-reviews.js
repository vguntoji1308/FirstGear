// Optional: pull your latest Google reviews into the site (merges, never deletes, skips duplicates).
//   GOOGLE_PLACES_API_KEY=... GOOGLE_PLACE_ID=... npm run reviews:sync            (uses config/<APP_ENV>.env too)
//   npm run reviews:sync -- --dry-run          show what would be imported without writing
//   npm run reviews:sync -- --api legacy       use the legacy Places API (newest 5 reviews) if your project has it
// Google returns at most 5 reviews per call, so run it on a schedule (e.g. daily) and the history builds up.
// Older reviews: use Admin > Import reviews with an export from your Google Business Profile.
const config = require('../src/config');
const { openDb } = require('../src/db');
const { importReviews } = require('../src/services/reviews');
const { fetchGoogleReviews } = require('../src/services/google-places');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apiIdx = args.indexOf('--api');
const api = apiIdx >= 0 ? args[apiIdx + 1] : (process.env.GOOGLE_PLACES_API || 'new');

(async () => {
  if (!['new', 'legacy'].includes(api)) throw new Error('--api must be "new" or "legacy".');
  const result = await fetchGoogleReviews({
    apiKey: process.env.GOOGLE_PLACES_API_KEY, placeId: process.env.GOOGLE_PLACE_ID, api,
    ...(process.env.GOOGLE_PLACES_BASE_URL ? { baseUrl: process.env.GOOGLE_PLACES_BASE_URL, legacyBaseUrl: process.env.GOOGLE_PLACES_BASE_URL } : {}), // test/proxy override
  });
  console.log(`Google returned ${result.rows.length} review(s)` + (result.rating ? ` (listing rating ${result.rating} from ${result.total ?? '?'} ratings)` : '') + '.');
  if (dryRun) {
    result.rows.forEach((r) => console.log(`  ${r.date}  ${r.rating}*  ${r.author}: ${r.text.slice(0, 80)}`));
    console.log('Dry run: nothing written.');
    return;
  }
  if (!result.rows.length) { console.log('Nothing to import.'); return; }
  const db = openDb(config.dbPath);
  const out = importReviews(db, result.rows, { replace: false });
  db.close();
  console.log(`Imported ${out.added} new review(s); skipped ${out.skippedDuplicates} already present.`);
  if (result.mapsUrl) console.log(`Tip: set GOOGLE_REVIEWS_URL=${result.mapsUrl} so "See us on Google" opens your exact listing.`);
})().catch((e) => { console.error(`Sync failed: ${e.message}`); process.exit(1); });
