# FirstGear Car Rentals

A complete, portable car-rental web app: modern animated UI, fleet catalog with filters, availability search, self-drive **or chauffeur** booking, add-ons, ratings and testimonials, FAQ chatbot, admin console, click-to-call on every page, Dev/PROD environments and CI/CD pipelines for Azure DevOps and GitHub Actions.

> **Content source:** the fleet (34 cars, INR prices, seats, transmission, photos), FirstGear logo, phone, email and address were imported from the FirstGear demo site. Things the source did not provide (fuel, category, body style, deposit, pick-up points, opening hours, testimonials, chauffeur names) are **inferred or placeholders** to review in `/admin` and the env files (see [docs/FEATURES.md](docs/FEATURES.md)). Manufacturer logos in `public/img/brands/` are **stand-in badges**, not the official trademarks.

## Quick start

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so there is no database server and no native build step).

```bash
npm install
cp config/dev.env.example config/dev.env     # Windows: copy config\dev.env.example config\dev.env
npm run start:dev                            # http://localhost:3000
```

With no `ADMIN_PASSWORD` set, dev prints a generated admin password in the console. Admin console: `/admin`.

Or with Docker: `cp config/dev.env.example config/dev.env && docker compose up --build`.

```bash
npm test        # API, pricing, config and Dev/PROD Docs tests (node:test, no extra deps)
npm run lint    # syntax check of all JS
```

## What is in the box

| Area | Details |
|---|---|
| Customer site | Home (hero, search, featured fleet, chauffeur, rental terms, testimonials, feedback, contact), Fleet (filters, ratings, reviews), Booking (3 steps, live pricing), My booking (lookup/cancel) |
| Chauffeur | Self-drive or chauffeur per booking, live chauffeur availability and pricing, no licence/deposit for chauffeur trips |
| Ratings & feedback | Per-car 1-5 star ratings with average; feedback form; moderated testimonials |
| Chatbot | Rule/FAQ bot with live fleet/price data and human hand-off (phone/email); pluggable interface for an LLM |
| Admin | Sign-in, cars CRUD, bookings status, chauffeurs, feedback moderation, ratings moderation, KPIs |
| Security | Helmet + strict CSP, JWT admin auth with bcrypt, rate limiting, CORS allow-list, validation, secrets only from env, prod refuses unsafe config |
| Ops | Dockerfile, compose (dev + prod), Azure DevOps + GitHub Actions pipelines (PROD manual approval), health endpoint |

## Documentation

In Dev, use the **Docs** navigation tab at `/docs` for usage and a runnable PowerShell booking
example. The page, API reference and Docs assets return 404 in PROD; hiding the tab is not the
only protection. See [local setup](docs/LOCAL_SETUP.md#public-access-from-this-computer) for
temporary public access and its exposure risks.

- [Local setup](docs/LOCAL_SETUP.md)
- [Environments: Dev & PROD](docs/ENVIRONMENTS.md)
- [Deployment guide](docs/DEPLOYMENT.md) (Docker, Azure, any host, both pipelines)
- [Architecture & stack rationale](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Runbook](docs/RUNBOOK.md)
- [Feature list, extras and Luxerra-inspired ideas](docs/FEATURES.md)

## Project layout

```
src/            Express API (routes, services, chatbot, config, DB)
public/         Static front-end (HTML, CSS, vanilla JS) served by the API
config/         dev.env.example, prod.env.example (templates only)
test/           node:test suites
docs/           Documentation
azure-pipelines.yml, .github/workflows/ci-cd.yml, Dockerfile, docker-compose*.yml
```

## Before go-live checklist

1. Set a real `BUSINESS_PHONE`, email, address, hours and social URLs.
2. Provide `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` from a secret store.
3. Put TLS in front (reverse proxy / platform) and set `CORS_ORIGINS` if the site is split across origins.
4. Mount persistent storage for `/app/data` and schedule backups ([runbook](docs/RUNBOOK.md)).
5. Replace the demo "pay online" option with a real payment gateway if you need card capture.
6. Update `public/sitemap.xml` with your domain and review the rental terms text with your legal adviser.
