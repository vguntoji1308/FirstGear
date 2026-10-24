# Environments: Dev and PROD

The app reads **only environment variables**. `APP_ENV` (`dev` | `prod`) picks an optional env file, `config/<APP_ENV>.env`, then `.env`. Real environment variables always win over files, so hosts and pipelines can inject values without files.

| | Dev | PROD |
|---|---|---|
| Template | `config/dev.env.example` | `config/prod.env.example` |
| Real file (git-ignored) | `config/dev.env` | `config/prod.env` (or use platform env vars / secret store) |
| Secrets | Optional; random ones are generated and a one-off admin password is printed | **Required.** App refuses to start if missing, < required length or placeholder-like |
| Demo data | `SEED_DEMO_DATA=true` | `false` |
| Rate limits | Relaxed | Strict defaults |
| Proxy trust | off | on (`TRUST_PROXY=true`, behind a load balancer) |
| CORS | same-origin | explicit allow-list; `*` is rejected |
| UI | Shows an orange "dev environment" badge | No badge |
| Usage Docs | Docs tab, `/docs` and `/docs/api` | No tab; all Docs routes/assets return 404 |
| Database | `data/dev.sqlite` | `/app/data/prod.sqlite` on a persistent volume |

## Variable reference

| Variable | Purpose | Default |
|---|---|---|
| `APP_ENV` | `dev` or `prod` | `dev` (`prod` if `NODE_ENV=production`) |
| `PORT` | HTTP port | 3000 |
| `HOST` | Bind address; use `127.0.0.1` for a local-only process | `0.0.0.0` (needed inside containers) |
| `DB_PATH` | SQLite file | `data/<env>.sqlite` |
| `JWT_SECRET` | Signs admin tokens (32+ chars in prod) | random in dev |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initial admin account (created if absent; 12+ chars in prod) | generated in dev |
| `JWT_EXPIRES_IN` | Admin session length | 8h |
| `CORS_ORIGINS` | Comma-separated allowed origins | empty (same-origin) |
| `TRUST_PROXY` | Trust `X-Forwarded-*` | true in prod |
| `RATE_LIMIT_MAX` / `_WRITE_MAX` / `_LOGIN_MAX` / `_WINDOW_MS` | Per-IP limits per window (general / bookings+reviews+feedback / login) | 300 / 30 / 10 / 15 min |
| `GOOGLE_REVIEWS_URL` | Link behind "See us on Google" (your Google Maps listing) | a Maps search for First Gear Cars |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID` | Optional Google reviews sync (`npm run reviews:sync`), see [GOOGLE_REVIEWS](GOOGLE_REVIEWS.md). The key is a secret | unset |
| `SEED_DEMO_DATA` | Demo reviews & testimonials on first run | true in dev |
| `BUSINESS_NAME`, `BUSINESS_PHONE`, `BUSINESS_EMAIL`, `BUSINESS_ADDRESS`, `BUSINESS_HOURS`, `BUSINESS_SUPPORT_NOTE` | Shown site-wide. **`BUSINESS_PHONE` drives every click-to-call button** | placeholders |
| `SOCIAL_FACEBOOK` `_INSTAGRAM` `_X` `_YOUTUBE` `_WHATSAPP` | Social links (set to empty to hide one). LinkedIn is not displayed | `myfirstgear` profiles; WhatsApp uses the business phone link |
| `CURRENCY`, `CURRENCY_SYMBOL`, `TAX_RATE` | Money display and tax | INR, ₹, 0.05 (assumed GST: confirm) |
| `MIN_DRIVER_AGE`, `YOUNG_DRIVER_UNDER`, `YOUNG_DRIVER_FEE_PER_DAY` | Age rules | 21, 25, 300 |
| `CHAUFFEUR_DAILY_RATE` | Chauffeur price per day | 1200 |
| `WEEKLY_DISCOUNT` | Discount for 7+ day rentals | 0.10 |
| `MAX_RENTAL_DAYS`, `FREE_CANCELLATION_HOURS` | Booking limits and policy text | 30, 48 |
| `CHATBOT_PROVIDER` | `rules` (LLM pluggable, see ARCHITECTURE) | rules |

## Rules for secrets
- Never commit `config/dev.env`, `config/prod.env` or `.env` (they are git-ignored and excluded from the Docker build context).
- In pipelines, keep `JWT_SECRET` and `ADMIN_PASSWORD` in a secret variable group, Key Vault, or GitHub environment secrets.
- Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
- The admin password is only used to seed the first admin user (hashed with bcrypt). Changing the env var later does not change an existing user; delete the user row or the DB to re-seed (see runbook).
