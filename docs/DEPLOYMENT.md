# Deployment guide

The deliverable is one container image (or just Node 22 + the repo). Nothing in the repo is cloud-specific, so you can move it to any host. Nothing in this repository deploys anything on its own; pipelines only run when you connect them.

## 1. Run anywhere with Docker (simplest)
```bash
cp config/prod.env.example config/prod.env      # fill in real values on the server only
docker compose -f docker-compose.prod.yml up -d --build
```
- Binds to `127.0.0.1:3000`; put a TLS reverse proxy in front (example Caddyfile: `yourdomain.com { reverse_proxy 127.0.0.1:3000 }`).
- Data lives in the `prod-data` volume (`/app/data`). Back it up ([runbook](RUNBOOK.md)).
- Update: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.

## 2. Run without Docker
```bash
npm ci --omit=dev
APP_ENV=prod node src/server.js        # supply env vars via systemd/pm2/your platform
```
Run under a process manager (systemd, pm2) and keep `data/` on persistent storage.

## 3. Managed container platforms
Build and push the image, then point the platform at it and set the environment variables from `config/prod.env.example` as app settings/secrets. Set the platform health probe to `GET /api/health`. Examples: Azure Web App for Containers / Container Apps, AWS App Runner / ECS, Google Cloud Run, Fly.io, Render.

> **SQLite note:** the database is a single file, so run **one instance** with a persistent disk. For multi-instance scaling, swap the data layer for PostgreSQL (all SQL is isolated in `src/routes/*.js`, `src/services/availability.js`, `src/seed.js`).

## 4. CI/CD pipelines
Both pipelines do the same: **install, lint, test, build image, push, deploy Dev automatically, then deploy PROD only after manual approval**, each followed by a health smoke test.

### Azure DevOps (`azure-pipelines.yml`)
1. Create a Docker Registry service connection (`firstgear-acr`) and an Azure Resource Manager one (`firstgear-azure`); update the `parameters` at the top (registry name etc.).
2. Create **Environments** `firstgear-dev` and `firstgear-prod`. On `firstgear-prod` add **Approvals and checks > Approvals** with your reviewers.
3. Create **Variable groups** `firstgear-dev` / `firstgear-prod` with: `webAppName`, `webAppHost`, `JWT_SECRET` (secret), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (secret), `BUSINESS_PHONE`, `BUSINESS_EMAIL`, `BUSINESS_NAME`, `CORS_ORIGINS`.
4. Create the pipeline from the YAML. The `ApproveProd` stage (ManualValidation) and the environment approval both gate PROD.

### GitHub Actions (`.github/workflows/ci-cd.yml`)
1. Settings > Environments: create `dev` and `production`; on `production` enable **Required reviewers** (this is the manual approval).
2. Per environment: secret `AZURE_WEBAPP_PUBLISH_PROFILE`; variables `WEBAPP_NAME`, `WEBAPP_HOST`.
3. The image is pushed to GHCR using the built-in `GITHUB_TOKEN`; make the package accessible to your host (pull credentials).
4. Set the app settings (`APP_ENV`, `JWT_SECRET`, `ADMIN_PASSWORD`, `BUSINESS_PHONE`, `DB_PATH`, ...) on the web app itself.

To target a different host, replace the deploy step in either file (e.g. `kubectl set image`, `ssh ... docker compose pull`, `flyctl deploy`); the build/test stages stay the same.

## 5. Release checklist
1. Pipeline green on `main` (tests pass).
2. Dev deployed and smoke-tested (`/api/health`, make a test booking, chat, admin sign-in).
3. Approve PROD. Confirm `/api/health` shows `"env":"prod"`.
4. Verify the click-to-call number and social links on the live site.
5. Rollback = redeploy the previous image tag (see runbook).
