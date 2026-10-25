# Google reviews sync (optional)

## Live reviews page

**Rate Us on Google** opens Google's review-writing page when `GOOGLE_PLACE_ID` is configured.
Until then it opens the configured Google listing link (or the default business search).

`/reviews` defaults to **Google reviews**, fetched server-side from Places API (New) via
`GET /api/google-reviews`, sorted highest rating first (newest first for equal ratings).
Configure `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID` below and restart the server.
This live view does not save reviews to SQLite, does not cache the response and provides
reviewer profile links and Google Maps attribution. Google returns at most five selected
reviews, not the full listing; sorting applies only to those returned. The listing's overall
rating/count is shown separately from the displayed-review summary.

The second view retains website feedback and previously imported reviews, including Dev
pending feedback. Missing credentials or Google errors are shown explicitly; sample reviews
are never substituted in the live Google view. API requests are billable; configure quotas
and billing alerts before public exposure.

`npm run reviews:sync` pulls your latest Google reviews through Google's **official Places API** and adds them to the site (home page shows the 5 newest, `/reviews` lists all). It only adds: existing reviews are never deleted, and duplicates are skipped.

## 1. One-time Google setup
1. Open <https://console.cloud.google.com/>, create (or pick) a project and **enable billing** (Google requires a billing account; Place Details calls are billed per request, and a daily or weekly run costs very little. Check current pricing and free quota on Google's site).
2. **APIs & Services > Library**: enable **Places API (New)**.
3. **APIs & Services > Credentials > Create credentials > API key**. Then **restrict** it: *API restrictions* = Places API (New) only, and *Application restrictions* = the IP address of the machine/server that will run the sync.
4. Find your **Place ID** with Google's *Place ID Finder* (<https://developers.google.com/maps/documentation/places/web-service/place-id>): search "First Gear Cars", copy the ID that starts with `ChIJ`.

## 2. Configure (never commit the key)
Set these as real environment variables or in the git-ignored `config/dev.env` / `config/prod.env`:

```
GOOGLE_PLACES_API_KEY=<your key>      # secret
GOOGLE_PLACE_ID=ChIJ...               # from the Place ID Finder
GOOGLE_REVIEWS_URL=<link to your Google listing>   # optional, used by "See us on Google"
```

## 3. Run
```bash
npm run reviews:sync -- --dry-run     # preview: prints the reviews, writes nothing
npm run reviews:sync                  # import new reviews
npm run reviews:sync -- --api legacy  # only if your project already has the legacy Places API: returns the 5 NEWEST reviews
```
The command prints how many reviews Google returned and how many were new, never prints the key, and exits non-zero on errors (bad key, API not enabled, billing off) with Google's message.

In Docker: `docker compose exec web node scripts/sync-google-reviews.js`.

**Schedule it** (the API returns at most 5 reviews per call, so regular runs build up the history): Windows Task Scheduler, `cron`, or a scheduled pipeline job that runs the command with the secrets from your secret store.

## Limits and things to know
- **5 reviews per call.** The default (new) API returns Google's "most relevant" 5; the legacy API can return the 5 newest. For older reviews, export them from your Google Business Profile and use **Admin > Import reviews**.
- **Google's terms.** Google Maps Platform terms restrict storing and caching Places content (including reviews) beyond short-term caching, and require attribution. Reviews are labelled "Google review" on the site and link to your listing. For a permanent archive, prefer reviews you export or receive yourself from your Business Profile, and have your legal adviser confirm what is allowed for your use.
- Reviews from customers are shown as written (text is escaped, never rendered as HTML).
