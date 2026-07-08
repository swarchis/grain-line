# Pulse (RestaurantOS) — Build State
*Last updated: June 10, 2026 · Keep this file current — it is the canonical context for every build session.*

## Live Platform
- **App/API:** https://restaurantosapi-production-434f.up.railway.app (Railway, deploys on git push to `main`)
- **Repo:** github.com/vikrambhambri1974-sys/restaurantos (monorepo: `apps/api` Express + `apps/web` React/Vite, `@restaurantos/db` pg helper)
- **DB:** Railway Postgres (`acela.proxy.rlwy.net:32514`) — credentials in Railway vars / local scripts
- **Test login:** vikram@roohsf.com (owner, Rivaaz Restaurant Group)
- **Tenant:** `fae33a6d-1124-48ac-bff8-3a734072acad` · Rooh SF loc `19a68183…340` · Alora SF loc `7dc07c6e…db2`

## Workflow (every change)
Claude edits files → copies to `/mnt/user-data/outputs/` → user downloads → `cp ~/Downloads/<file> <repo path>` → `git add/commit/push` → Railway deploys. CSV imports run locally: `cd apps/api && DATABASE_URL=… node <script>.js` reading `~/Downloads/` (filenames contain spaces).

## Shipped (by area)
**Agents 1–11:** Marketing (social, newsletter w/ Resend + Dropbox images, SMS/WhatsApp via Twilio), Financial KPI (weekly_kpi, $ amounts, month compare), Inventory, Reviews, Cash P&L (CSV import, categories, learned rules), Compliance, Local SEO, Loyalty (+portal, Toast loyalty webhook), Labor (7shifts-style scheduler, violations, team messaging, staff PWA w/ PIN), Training & Performance (learning library + **module videos**: upload ≤25MB to Postgres, YouTube/Loom embeds, Dropbox picker w/ temp links), Menu Management.
**Reports library** (`/reports`, card-based, per-report access owner/manager): MoM Sales (multi-restaurant pivot, YoY, INR for Delhi), Payroll (all CSV columns incl. ER taxes, weekly/monthly), Labor vs Demand (sales-per-labor-$, ±15% flags), Marketing ROI (campaign vs 4-wk baseline).
**GA infrastructure:** `tenant_integrations` (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY), `tenant_business_info` (10DLC), per-tenant Twilio provisioning (subaccount + number; TrustHub stubbed behind TWILIO_TRUSTHUB_ENABLED), public `/api/twilio/inbound` STOP webhook (resolves tenant by To number), newsletters from platform domain + tenant reply-to, **Setup page** (`/setup`: business form, SMS provision, POS connect, white-glove pitch).
**POS:** Square OAuth (public callback `/api/pos/square/callback`, auto location-map, 90-day sales sync → weekly_kpi, bar/food via catalog keywords, token refresh, Sync-now), Toast (API sync via existing toastAdapter creds, CSV Sales Summary import fallback).
**Intelligence:** Assistant `run_sql` tool (schema-aware, SELECT-only, $1 tenant guard, 200 rows, 8s timeout), Monday Brief (Claude-written, dashboard card + Resend email + cron `/api/cron/monday-briefs?secret=CRON_SECRET`), Assistant chips seeded from brief.
**Auth:** email/password + Google OAuth (client ID hardcoded in Login.jsx + GOOGLE_CLIENT_ID).
**Docs in outputs/:** Pulse_Competitive_and_Pricing_Analysis.md (tiers $99/$249/$449, TAM $5.3B→$12-15B 2030, SOM ~$13-15M yr5), PLATFORM_SPEC.md (older).

## Data imported (Rivaaz)
weekly_kpi: Alora SF 34 wks (boh_labor 2026-03-09 = 11000 PLACEHOLDER, need real value), Fitoor (v2 import), Rooh. weekly_payroll: all 7 locations (~125 wks Alora SF + 6 others). monthly_sales: all restaurants from MoM CSV (ROOH DELHI = INR). Unimported uploads: FITOOR SM/SR KPI CSVs, ALORA SR KPI tsv.

## Railway env vars
Set: ANTHROPIC_API_KEY, JWT_SECRET, GOOGLE_CLIENT_ID, INTEGRATIONS_ENCRYPTION_KEY, DROPBOX_ACCESS_TOKEN, EMAIL_FROM(?).
Pending: RESEND_API_KEY, CRON_SECRET (+ Monday 7am cron), SQUARE_APP_ID/SECRET (create app, redirect = …/api/pos/square/callback), TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER (master acct + TrustHub primary profile approval → then TWILIO_TRUSTHUB_ENABLED=true).

## Pending / roadmap
Real value for Alora SF 2026-03-09 boh_labor · TrustHub 10DLC API flow + status poller · nightly POS sync cron · Square labor/catalog → Labor & Menu agents · Toast Partner Connect application · Plaid Link (Cash P&L) · Google Business/Meta OAuth · Stripe plan gating (billing.js exists) · reservation email ingestion · anomaly SMS alerts · empty states per agent · R2 storage if video uploads grow.

## Gotchas (hard-won — read before editing)
1. Public webhooks/callbacks/cron MUST mount before `app.use('/api', authMiddleware)` (~line 303 in index.js).
2. Python `code.replace()` fails silently — always assert/verify after every replace (lost MoMReport + module.exports this way).
3. Never nest template literals when generating JS from Python heredocs — use string concat.
4. pg DATE cols → cast `::text` (and alias to avoid ambiguous ORDER BY); NUMERIC(6,2) overflows pcts >99.99 → use (8,2).
5. CSV column matching: exact() not includes() ('FOH' matched 'E.R Taxes-Wages FOH'); Google-Sheets CSVs need char-walk parser (quoted embedded newlines); strip `[$%,'\u2019]`.
6. User CSV filenames contain spaces: `Weekly Payroll_2025.xlsx - X.csv`.
7. `ros_token` = localStorage JWT key. Reports access: owner/manager always pass canViewAgent.
8. psql -c breaks on parens → heredoc. mkdir -p before cp into new repo dirs.
9. Claude's scratch container resets between sessions — but `/mnt/user-data/outputs/` and `/mnt/transcripts/` persist. Latest shipped copies of all key files live in outputs/.
10. Training page (Agent10) runs on agent-6 API routes; `/api/agent-10/videos` is agent-10's only mount.
