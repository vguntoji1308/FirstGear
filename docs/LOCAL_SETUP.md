# Local setup

## Prerequisites
- Node.js **22.13 or newer** (`node -v`). No database server needed.
- Optional: Docker Desktop for the container route.

## Option A: Node
From the actual Windows checkout, without switching branches:

```powershell
Set-Location C:\git\velora-car-rentals
# Install dependencies only if node_modules is missing:
# npm ci
if (!(Test-Path config\dev.env)) { Copy-Item config\dev.env.example config\dev.env }
$env:HOST = '127.0.0.1'
npm run start:dev
```

`HOST=127.0.0.1` restricts this local process to loopback. Containers need `HOST=0.0.0.0`
(the default). No inbound firewall rule or router port forwarding is required for local use.

Cross-platform setup:

```bash
npm install
cp config/dev.env.example config/dev.env     # PowerShell: Copy-Item config\dev.env.example config\dev.env
npm run start:dev                            # auto-restarts on file changes
```
Open <http://localhost:3000>. Leave `ADMIN_PASSWORD` blank in `config/dev.env` to get a generated one printed in the console, or set your own (12+ characters). Sign in at `/admin` with `ADMIN_EMAIL`.

**Existing database:** a generated startup password is only saved when that admin email does
not already exist. Restarting does not reset an existing account. Keep the original password;
do not delete a database containing data you want to keep.

Dev has a **Docs** navigation tab at <http://localhost:3000/docs> with usage, all APIs and
a PowerShell quote/book/lookup/cancel example. PROD has neither the tab nor the Docs routes
(`/docs`, `/docs.html`, `/docs/api`, `/docs/usage.js`, `/docs/usage.css` all return 404).

`npm run start:dev` / `npm run start:prod` work on Windows, macOS and Linux (`npm start` also runs `dev`, the default environment).

## Option B: Docker
```bash
cp config/dev.env.example config/dev.env
docker compose up --build
```
On Windows you can use the helper instead: `.\scripts\docker-local.ps1` (add `-Prod` for the production-style compose file, `-Down` to stop).

**Installing Docker Desktop on Windows (one time):** install from docker.com (or `winget install Docker.DockerDesktop`) with the WSL 2 backend, restart when asked, start Docker Desktop, and confirm `docker version` works. This needs administrator rights, and company laptops may require IT approval.

Data persists in the `dev-data` volume. Reset with `docker compose down -v`.

## Seed data and reset
The first start creates `data/dev.sqlite` with 4 locations, 34 cars, 3 chauffeurs and (dev only) demo reviews and testimonials. Existing database rows are preserved. For a clean demo without losing existing data, stop the app and set `DB_PATH=./data/preview.sqlite` to a new file before starting.

## Public access from this computer

Localhost is not a public URL. A tunnel forwards an HTTPS URL to this local server;
the computer must remain awake and both app and tunnel must stay running.
Choose an access-controlled preview for private testing or explicitly approve an anonymous demo
before starting a tunnel. Do not open router ports or change firewall rules for this.

### Private preview with Cloudflare Access (selected setup)

No public route has been created yet. Choose a hostname on your Cloudflare-managed domain
(for example `rentals-dev.yourdomain.com`) and the email addresses allowed to sign in.
Do not paste Cloudflare API keys, tunnel tokens or passwords into chat or the repository.

1. **Protect the hostname first.** In Cloudflare Zero Trust, open **Access controls > Applications**,
   create a self-hosted application and add the exact public hostname with no path restriction,
   so the policy covers the site, `/api`, `/admin`, Docs and static assets.
2. Add an **Allow** policy restricted to your explicit email addresses. Use your identity provider
   or enable email one-time PIN authentication. Do not add an Everyone or Bypass policy.
   Save the application before publishing any tunnel route.
3. In **Networking > Tunnels**, create a named tunnel. Select Windows and follow the dashboard's
   official client installation/connection instructions locally. Treat the connector token as a
   secret. A Windows service installation requires administrator approval; do not install a service
   on a shared or managed machine without permission.
4. Once the connector is healthy, add a **Published application** route for that same hostname,
   with service URL `http://127.0.0.1:3000`. Leave the path blank to forward the entire app.
   Keep the Node app running and bound to loopback; do not enable router port forwarding.
5. In an unsigned-in/incognito browser, confirm both `https://YOUR_HOSTNAME/` and
   `https://YOUR_HOSTNAME/api/cars` require Access authentication rather than returning app content.
   Confirm a non-allowed identity is denied. Then sign in as an allowed identity and verify Fleet,
   Docs, and a synthetic booking. Staff sign-in still separately requires the app's admin account.
6. To revoke the preview, disable the published route or stop the connector. Keep the Access policy
   in place until after the route is removed. Keep this laptop awake while the preview is in use.

Cloudflare Access adds authentication to an Internet-facing hostname; it is not a private-IP network.
External PowerShell/curl requests also need Access authentication (for example a separately scoped
service-token policy); the Docs example is immediately runnable against localhost, not through
an interactive Access login page. Do not bypass Access on `/api` to make scripts work.

Official references: [Access application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
and [dashboard-managed tunnel setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/).

### Anonymous temporary demo (not selected)

For an approved anonymous, temporary demo, install Cloudflare's `cloudflared` client from its
official distribution, then in a separate terminal run:

```powershell
cloudflared tunnel --url http://127.0.0.1:3000
```

The command prints a temporary HTTPS URL. This shares the **entire application** with anyone who
has the URL, including Docs in Dev, guest booking/review/feedback writes and admin sign-in.
Use a separate demo database and synthetic data. Do not share credentials in the URL.
The public hostname generally changes when the quick tunnel restarts. Stop the tunnel with Ctrl+C
to revoke access. For private previews, configure a named tunnel with Cloudflare Access (requires
account/domain configuration) or another authenticated tunnel instead of a quick tunnel.
Do not treat an unguessable URL or `robots` exclusions as authentication.

Keep `TRUST_PROXY=false` unless the server can only be reached through a known single proxy.
Without proxy trust, tunneled visitors share the proxy's rate-limit bucket; this is safer than
trusting arbitrary forwarded headers but may produce `429` during group testing.
The site and API share one origin, so do not set wildcard CORS for a tunnel.
For an always-on production URL, use the [deployment guide](DEPLOYMENT.md) rather than a laptop tunnel.

## Tests and checks
```bash
npm test         # API, pricing, availability, security and config tests (in-memory DB)
npm run lint     # syntax check
```
Tests never touch `data/`; they use an in-memory database.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Cannot find module 'node:sqlite'` | Upgrade Node to 22.13+ |
| Port in use | Set `PORT=3001` in `config/dev.env` |
| `Invalid prod configuration` | Expected when `APP_ENV=prod` without real secrets; see [ENVIRONMENTS](ENVIRONMENTS.md) |
| `ExperimentalWarning: SQLite` | Harmless: `node:sqlite` is still flagged experimental in Node 22 |
