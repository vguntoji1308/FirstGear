# Runbook

## Health and monitoring
- Probe: `GET /api/health` → `{"status":"ok","env":"prod"}`. Wire it to your platform health check/uptime monitor (the Docker image already has a `HEALTHCHECK`).
- Logs go to stdout/stderr (collect with your platform or `docker compose logs -f web`). Unexpected errors log a stack trace and return a generic 500 to the client.
- Watch for: spikes in 429 (abuse or too-tight limits), repeated 401 on `/api/auth/login` (guessing), 5xx.

## Common operations
| Task | How |
|---|---|
| Change phone/address/socials | Update the env vars and restart. No rebuild needed |
| Add/edit cars, chauffeurs | `/admin` console |
| Approve a testimonial | `/admin` > Feedback > Approve |
| Remove abusive review | `/admin` > Car ratings > Delete |
| Cancel/complete a booking | `/admin` > Bookings > status dropdown |
| Customer lost their reference | Find it in `/admin` > Bookings (search by email in the table) |
| Rotate `JWT_SECRET` | Change the secret and restart: all admin sessions are signed out |
| Reset admin password | Stop app, run `node -e "const {DatabaseSync}=require('node:sqlite');const b=require('bcryptjs');const d=new DatabaseSync(process.env.DB_PATH);d.prepare('UPDATE users SET password_hash=? WHERE email=?').run(b.hashSync(process.env.NEW_PW,12),process.env.ADMIN_EMAIL)"` with `DB_PATH`, `NEW_PW`, `ADMIN_EMAIL` set; start app |

## Backup and restore (SQLite)
- The whole state is `DB_PATH` (plus `-wal`/`-shm` side files while running).
- Safe online backup: `sqlite3 /app/data/prod.sqlite ".backup '/backups/prod-$(date +%F).sqlite'"`, or snapshot the volume. Run daily and keep 14+ days off-host.
- Restore: stop the app, replace the DB file (delete stale `-wal`/`-shm`), start, check `/api/health` and a booking lookup.
- Contains customer PII (names, emails, phones, DOB, licence numbers): encrypt backups, restrict access, and apply your retention policy.

## Deploy and rollback
- Deploy: merge to `main` → pipeline → Dev → approve → PROD.
- Rollback: re-run the deploy stage with the previous image tag (Azure DevOps: re-run the earlier build's `DeployProd`; GitHub: re-run the earlier successful workflow's `deploy-prod`; Docker: `IMAGE=<previous> docker compose -f docker-compose.prod.yml up -d`). The schema is created with `IF NOT EXISTS` and only ever grows additively, so rollbacks do not need DB changes.

## Troubleshooting
| Symptom | Likely cause / action |
|---|---|
| App exits at start with `Invalid prod configuration` | Missing/weak `JWT_SECRET` or `ADMIN_PASSWORD`, or `CORS_ORIGINS=*`. Fix env |
| All users get 429 | `TRUST_PROXY=false` behind a proxy makes everyone share one IP. Set `TRUST_PROXY=true` |
| Admin gets signed out repeatedly | `JWT_SECRET` unset in dev (random per restart) or multiple instances with different secrets |
| Data disappears after redeploy | `/app/data` not on a persistent volume |
| `database is locked` | More than one instance writing the same file; run one instance or move to PostgreSQL |
| Booking 409 "no longer available" | Another booking took the dates; the customer should pick other dates/car |
| Chat widget says it cannot answer | `/api/chat` failing: check logs and `CHATBOT_PROVIDER` value |

## Security incident quick steps
1. Rotate `JWT_SECRET` and the admin password; restart.
2. Review `/admin` for unexpected cars/bookings; restore from backup if tampered.
3. Check platform logs for the source IPs; block at the proxy/WAF.
4. If PII may be exposed, follow your breach-notification process.

## Contacts
Fill in: on-call owner, hosting provider support, domain/DNS owner, payment provider (if added).
