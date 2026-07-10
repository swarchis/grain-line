# Grainline — Production OS for Independent Clothing Brands

Takes a founder from a rough sketch to a manufactured, sellable product — design, tech pack, vendor sourcing, quoting, and (eventually) production and sales — in one tool instead of a scattered stack of spreadsheets, DMs, and freelance tech-pack files.

**Positioning, on purpose:** this is *production intelligence*, not an AI design generator. The AI never makes creative or final business decisions — it drafts, extracts, scores, and warns; the founder always reviews and decides. Every AI feature in this repo follows that rule.

---

## Architecture

```text
grainline/
├── la-guia/                 React + Vite frontend
│   ├── src/
│   │   ├── components/      Sidebar, Photopea embed, garment silhouettes, shared UI
│   │   ├── context/         Auth, Products, Vendors, Production, Notifications (Supabase-backed)
│   │   ├── lib/             Supabase client, formatters
│   │   └── pages/            One file per route
│   ├── .env.local           VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
│   └── package.json
├── api/                      Express backend — the only place secret keys are used
│   ├── index.js              All AI endpoints (Gemini + Tavily)
│   ├── .env                  GEMINI_API_KEY, TAVILY_API_KEY, PORT (not committed)
│   └── package.json
└── supabase/
    └── migrations/           SQL Schema for your Supabase project
```

**The split is deliberate:** the frontend talks to Supabase *directly* for all data (products, designs, vendors, quotes, etc.), protected by Row Level Security — no backend round-trip needed for CRUD. The Express backend (`api/`) exists **only** for calls that need a secret key that can't live in browser code (Gemini, Tavily).

**Design canvas:** the Design Studio embeds [Photopea](https://www.photopea.com) via `postMessage`. Vendor web search uses Tavily feeding real results to Gemini for structuring.

---

## What's real vs. mock

The frontend was scaffolded with static mock data first, then converted page-by-page to real Supabase data. 

**Real (Supabase-backed):**
Auth · Brands (multi-brand — a user can own or belong to several, switching reloads every context) · Products · Designs (including AI-generated silhouettes) · Tech Packs (BOM, Measurements, Sampling Checklist) · Collections · Materials (Library & Usage Analysis) · Vendors · Quotes · Production Orders (Detail, Creation & List view) · Notifications · Settings · Team members & permissions (invite-by-email, role-gated, no transactional email yet — see gotchas) · User preferences (theme, onboarding state) · Command palette / global search · Keyboard shortcuts · Onboarding walkthrough

**Real, needs your own Stripe keys to actually process payments:**
Billing & subscription plans (Free / Basic / Premium) — real Checkout, Customer Portal, and plan-limit enforcement (active products, team seats, AI generations/month), see Billing setup below. A handful of Premium feature lines are marked "Coming soon" in the UI — real marketing copy for where the tier is headed, not built into the app yet.

**Still static mock data** (`la-guia/src/data/mockData.js`):
`SalesDashboard.jsx` (product list is real, revenue numbers are mock pending a real store connection) · `ContentHub.jsx`

---

## Local setup

### 1. Supabase project
You need access to your Supabase project. Run these in the SQL Editor in order:
1. `supabase/migrations/INITIAL_SCHEMA.sql` (all core tables: brands, collections, products, designs, tech_packs, vendors, quotes, production_orders, materials, notifications — with RLS)
2. `supabase/migrations/002_vendors_and_quotes.sql`
3. `supabase/migrations/003_vendor_enhancements.sql`
4. `supabase/migrations/004_production_orders.sql`
5. `supabase/migrations/005_ai_silhouette.sql`
6. `supabase/migrations/006_user_preferences.sql` (per-user theme/onboarding/preferences)
7. `supabase/migrations/007_teams_and_rls.sql` — **required** for multi-brand switching, team members, and global search to work; also enables row-level security on every table that didn't have it (everything except `notifications` was previously wide open to any authenticated client). Run this even on an existing project.
8. `supabase/migrations/008_billing.sql` (plan_tier + Stripe IDs on `brands`, `ai_usage_log` for metering)

Migrations 002–008 use `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, so they're safe no-ops on a DB that already has those columns from `INITIAL_SCHEMA.sql` — run them anyway for a fresh project.

- **Storage bucket**: A public bucket named `mockups` must exist for Design Studio snapshots.
- **Auth**: "Confirm email" should be disabled in Auth settings for local testing.

### 2. Backend (`api/`)
```bash
cd api
npm install
node index.js
```
Create `api/.env` with `PORT`, `GEMINI_API_KEY`, and `TAVILY_API_KEY`.

### 3. Frontend (`la-guia/`)
```bash
cd la-guia
npm install
npm run dev
```
Create `la-guia/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Open **http://localhost:5173**. Both servers must be running.

### 4. Billing (Stripe)
1. Add `STRIPE_SECRET_KEY=sk_...` to `api/.env`.
2. From `api/`, run `node scripts/setup-stripe-products.js` once — creates the Basic ($29/mo) and Premium ($79/mo) Products/Prices in your Stripe account and writes `STRIPE_PRICE_BASIC`/`STRIPE_PRICE_PREMIUM` back into `api/.env`. Safe to re-run.
3. Restart the backend so it picks up the new env vars.
4. (Optional) add `APP_URL` to `api/.env` if the frontend isn't on `http://localhost:5173` — it's used to build the Stripe Checkout success/cancel redirect URLs.

Checkout confirmation and subscription-status reconciliation both call Stripe directly from the backend and write the result to Supabase under the signed-in user's own session — no webhook or service-role key needed. That does mean a cancellation made through the Stripe portal only takes effect the next time the founder opens Settings > Billing (that's when the reconciliation check runs), not instantly.

---

## API reference (`api/index.js`)

| Endpoint | Purpose |
|---|---|
| `/api/analyze-design` | Scores a captured canvas snapshot |
| `/api/generate-tech-pack` | Generates BOM + graded measurements from canvas |
| `/api/generate-silhouette` | Generates a stroke-only starting outline for a custom garment type not in the preset library |
| `/api/parse-vendor` | Extracts structured profile from pasted text |
| `/api/search-vendors` | Real-time web search via Tavily + Gemini extraction |
| `/api/analyze-vendor-fit` | Scores vendor/product material & economic fit |
| `/api/draft-vendor-email` | Drafts a structured vendor outreach email |
| `/api/create-checkout-session` | Starts a Stripe Checkout session for a plan upgrade |
| `/api/confirm-checkout` | Verifies a completed Checkout session before the frontend writes the new plan |
| `/api/create-portal-session` | Opens Stripe's Customer Portal for managing/cancelling a subscription |
| `/api/subscription-status` | Reconciles a brand's plan against the live Stripe subscription status |

---

## Known gaps / next up

- ~~**Task 2.1:** Implement backend AI Text-to-SVG logic for silhouette generation.~~ Done — `/api/generate-silhouette`, stored on `designs.ai_paths`.
- **Phase 3:** Replace Sales and Content dashboards with real Shopify/Social integrations (needs store/developer-app credentials — Sales Dashboard's chart is now real-data-shaped, still backed by mock numbers until this lands).
- **Task 4.1:** Inventory risk math engine based on sales velocity and brand risk profile — blocked on Phase 3 (needs real sales data).

## Gotchas

- **Never commit `node_modules`.**
- **Gemini Search grounding needs billing** — use Tavily instead.
- **Photopea resizing** — the container doesn't reliably resize; use the capture/remount pattern in `DesignDetail.jsx`.
- **Team invites don't send email yet** — inviting someone creates a real `brand_members` row; they're attached automatically the next time they sign up or log in with that email, but nothing notifies them, so tell them yourself. Needs a transactional email provider (Resend/SendGrid) to close the loop.
- **RLS was off almost everywhere before `007_teams_and_rls.sql`** — if you forked this project earlier and skipped that migration, any authenticated client could read/write any brand's data. Run it.