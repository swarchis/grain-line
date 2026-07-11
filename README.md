# Grainline — Production OS for Independent Clothing Brands

Takes a founder from a rough sketch to a manufactured, sellable product — design, tech pack, vendor sourcing, quoting, production, and sales — in one tool instead of a scattered stack of spreadsheets, DMs, and freelance tech-pack files.

**Positioning, on purpose:** this is *production intelligence*, not an AI design generator. The AI never makes creative or final business decisions — it drafts, extracts, scores, and suggests; the founder always reviews and decides. Every AI feature in this repo follows that rule.

---

## Architecture

```text
grainline/
├── la-guia/                 React + Vite frontend
│   ├── src/
│   │   ├── components/      Sidebar, Photopea embed, garment silhouettes, dashboard widgets, shared UI
│   │   ├── context/         Auth, Products, Vendors, Production, Notifications, Materials, Team, Sales,
│   │   │                    Billing (AIUsage), UserPreferences, Onboarding, AppUI (Supabase-backed)
│   │   ├── lib/              Supabase client, formatters, theme + keyboard-shortcut hooks
│   │   └── pages/            One file per route
│   ├── .env.local           VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
│   └── package.json
├── api/                      Express backend — the only place secret keys are used
│   ├── index.js              AI (Gemini + Tavily), Stripe billing, Shopify OAuth, Resend email
│   ├── scripts/               One-time setup scripts (Stripe product/price creation)
│   ├── .env                  Secret keys (not committed) — see Local setup
│   └── package.json
└── supabase/
    └── migrations/           SQL schema for your Supabase project, run in order
```

**The split is deliberate:** the frontend talks to Supabase *directly* for all data (products, designs, vendors, quotes, etc.), protected by Row Level Security — no backend round-trip needed for CRUD. The Express backend (`api/`) exists **only** for calls that need a secret key that can't live in browser code (Gemini, Tavily, Stripe, Shopify, Resend).

---

## What's real vs. mock

The frontend was scaffolded with static mock data first, then converted page-by-page to real Supabase data.

**Real (Supabase-backed):**
Auth · Brands (multi-brand — a user can own or belong to several, switching reloads every context) · Products (with favoriting and permanent delete) · Designs (including AI-generated silhouettes) · Tech Packs (BOM, Measurements, Sampling Checklist — deletable independently of the design) · Collections (deletable — un-groups its products rather than deleting them) · Materials (Library & Usage Analysis, deletable) · Vendors · Quotes · Production Orders · Notifications · Settings · Team members & permissions (invite-by-email with automated Resend delivery) · User preferences (theme, onboarding state) · Command palette / global search (entity content **and** sidebar pages) · Keyboard shortcuts · Onboarding walkthrough (auto-scrolls the highlighted feature into view, first-visit only) · Personalized Home dashboard (Continue where you left off, AI suggestions, Project health, Favorite projects, Calendar timeline, Recent activity, Upcoming deadlines, Quick actions) · Sales Dashboard & product break-even tracking (Shopify integration)

Every delete (design, tech pack, material, collection) goes through `ConfirmDeleteModal` (`la-guia/src/components/ConfirmDeleteModal.jsx`) — a deliberate trash-icon click opens it, and the actual delete button stays disabled until you type the item's exact name, so an accidental click or stray Enter key can't finish it.

**Real, needs your own keys to actually process/send:**
Billing & subscription plans (Free / Basic / Premium) — real Stripe Checkout, Customer Portal, and plan-limit enforcement (active products, team seats, AI generations/month). Sales data — real Shopify Custom App OAuth. Team invite emails — real Resend delivery (see Gotchas below for its free-tier limits). A handful of Premium feature lines are marked "Coming soon" in the UI — real marketing copy for where the tier is headed, not built into the app yet.

**Still static mock data** (`la-guia/src/data/mockData.js`):
`ContentHub.jsx`

---

## Local setup

### 1. Supabase project
You need access to your Supabase project. Run these in the SQL Editor **in order**:
1. `supabase/migrations/INITIAL_SCHEMA.sql` (core tables: brands, collections, products, designs, tech_packs, vendors, quotes, production_orders, materials, notifications — with RLS)
2. `supabase/migrations/002_vendors_and_quotes.sql`
3. `supabase/migrations/003_vendor_enhancements.sql`
4. `supabase/migrations/004_production_orders.sql`
5. `supabase/migrations/005_ai_silhouette.sql`
6. `supabase/migrations/006_user_preferences.sql` (per-user theme/onboarding/preferences)
7. `supabase/migrations/007_teams_and_rls.sql` — **required** for multi-brand switching, team members, and global search to work; also enables row-level security on every table that didn't have it (everything except `notifications` was previously wide open to any authenticated client). Run this even on an existing project.
8. `supabase/migrations/008_billing.sql` (plan_tier + Stripe IDs on `brands`, `ai_usage_log` for metering)
9. `supabase/migrations/009_shopify.sql` (Shopify connection + order sync tables)
10. `supabase/migrations/010_favorites.sql` (`is_favorite` on `products`, powers the Favorite projects dashboard widget)

Migrations 002–010 use `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, so they're safe no-ops on a DB that already has those columns — run them anyway on a fresh project, in order.

- **Storage bucket**: A public bucket named `mockups` must exist for Design Studio snapshots.
- **Auth**: "Confirm email" should be disabled in Auth settings for local testing.

### 2. Backend (`api/`)
```bash
cd api
npm install
node index.js
```
Create `api/.env`:
```
PORT=3001
GEMINI_API_KEY=...
TAVILY_API_KEY=...
STRIPE_SECRET_KEY=...
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
RESEND_API_KEY=...
```
`STRIPE_PRICE_BASIC`/`STRIPE_PRICE_PREMIUM` get written into this same file automatically by the billing setup script below.

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
4. (Optional) add `APP_URL` to `api/.env` if the frontend isn't on `http://localhost:5173` — it's used to build Stripe Checkout redirect URLs and the Resend invite link.

Checkout confirmation and subscription-status reconciliation call Stripe directly from the backend and write the result to Supabase under the signed-in user's own session — no webhook or service-role key needed. A cancellation made through the Stripe portal takes effect the next time the founder opens Settings > Billing (that's when the reconciliation check runs), not instantly.

**Testing plan-gated features locally:** `npm run dev` (Vite dev mode) shows a "Developer tools" block at the bottom of Settings > Billing & Plan with `Force Free` / `Force Basic` / `Force Premium` buttons — these write `plan_tier` directly, bypassing Stripe entirely, so you can test each tier's gating without a real Checkout session. Gated behind `import.meta.env.DEV`, so it never renders in a production build.

### 5. Shopify
Add `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` from a Shopify Custom App to `api/.env`. Connect a store from Settings once both servers are running — `/api/shopify/auth` starts the OAuth flow and `/api/shopify/callback` completes it.

### 6. Resend (team invite emails)
Add `RESEND_API_KEY` to `api/.env`. Without it, invites still create a real `brand_members` row but the email send is skipped (logged as a warning) — the invited person is still attached automatically the next time they sign up/log in with that email.

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
| `/api/dashboard-suggestions` | Generates 2–4 short, data-grounded suggestions for the Home dashboard's AI suggestions widget |
| `/api/create-checkout-session` | Starts a Stripe Checkout session for a plan upgrade |
| `/api/confirm-checkout` | Verifies a completed Checkout session before the frontend writes the new plan |
| `/api/create-portal-session` | Opens Stripe's Customer Portal for managing/cancelling a subscription |
| `/api/subscription-status` | Reconciles a brand's plan against the live Stripe subscription status |
| `/api/shopify/auth` | Starts the Shopify OAuth flow for a brand |
| `/api/shopify/callback` | Completes Shopify OAuth and stores the access token |
| `/api/shopify/fetch-orders` | Pulls recent orders for Sales Dashboard analytics |
| `/api/send-invite` | Dispatches teammate invitation emails via Resend |

---

## Known gaps / next up

- **Phase 3:** Sales Dashboard now pulls real Shopify orders where connected; break-even/product-performance math still assumes a connected store — brands without one see the dashboard shaped around what it looks like once they connect.
- **Task 4.1:** Inventory risk math engine based on sales velocity and brand risk profile — now unblocked by real Shopify order data, not yet built.
- **Home dashboard:** the AI suggestions widget is cached once per brand per calendar day (a manual "Refresh" re-runs it) so opening the dashboard doesn't silently spend AI usage on every visit.

## Gotchas

- **Never commit `node_modules`.**
- **Gemini Search grounding needs billing** — use Tavily instead.
- **Photopea resizing** — the container doesn't reliably resize; use the capture/remount pattern in `DesignDetail.jsx`.
- **Resend testing** — on the free tier without a verified domain, Resend only allows sending emails to the address you signed up with; invites to any other address will silently fail to deliver (the `brand_members` row is still created correctly).
- **RLS was off almost everywhere before `007_teams_and_rls.sql`** — if you forked this project earlier and skipped that migration, any authenticated client could read/write any brand's data. Run it.
- **"Continue where you left off" is tracked in `localStorage`**, per brand, per browser — it doesn't sync across devices since there's no server-side "last viewed" column.
