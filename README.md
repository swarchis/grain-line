### 1. `README.md`
*Refined status and setup instructions.*

```markdown
# Grainline — Production OS for Independent Clothing Brands

Takes a founder from a rough sketch to a manufactured, sellable product — design, tech pack, vendor sourcing, quoting, and (eventually) production and sales — in one tool instead of a scattered stack of spreadsheets, DMs, and freelance tech-pack files.

**Positioning, on purpose:** this is *production intelligence*, not an AI design generator. The AI never makes creative or final business decisions — it drafts, extracts, scores, and warns; the founder always reviews and decides. Every AI feature in this repo follows that rule.

---

## Architecture

```text
grainline/
├── la-guia/                 React + Vite frontend
│   ├── src/
│   │   ├── components/      Sidebar, Photopea embed, garment silhouettes, charts, shared UI
│   │   ├── context/         Auth, Products, Vendors, Production, Notifications, Sales (Supabase-backed)
│   │   ├── lib/             Supabase client, formatters
│   │   └── pages/            One file per route
│   ├── .env.local           VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
│   └── package.json
├── api/                      Express backend — the only place secret keys are used
│   ├── index.js              All AI endpoints (Gemini + Tavily) + Integration Proxy
│   ├── .env                  GEMINI_API_KEY, TAVILY_API_KEY, STRIPE_SECRET_KEY, SHOPIFY_CLIENT_ID (not committed)
│   └── package.json
└── supabase/
    └── migrations/           SQL Schema for your Supabase project
```

**The split is deliberate:** the frontend talks to Supabase *directly* for all data (products, designs, vendors, quotes, etc.), protected by Row Level Security — no backend round-trip needed for CRUD. The Express backend (`api/`) exists **only** for calls that need a secret key that can't live in browser code (AI, Shopify, Stripe).

---

## What's real vs. mock

The frontend was scaffolded with static mock data first, then converted page-by-page to real Supabase data. 

**Real (Supabase-backed):**
Auth · Brands (multi-brand support) · Products · Designs (AI-generated silhouettes) · Tech Packs (BOM, Measurements, Sampling Checklist) · Collections · Materials (Library & Usage Analysis) · Vendors · Quotes · Production Orders · Notifications · Settings · Team permissions · Sales Dashboards (Real Shopify Integration) · Product Performance (Live Break-even tracking)

**Real, needs your own keys:**
Billing (Stripe) · Sales Data (Shopify Custom App)

**Still static mock data** (`la-guia/src/data/mockData.js`):
`ContentHub.jsx`

---

## Local setup

### 1. Supabase project
You need access to your Supabase project. Run these in the SQL Editor in order:
1. `supabase/migrations/INITIAL_SCHEMA.sql` (all core tables with RLS)
2. `supabase/migrations/002_vendors_and_quotes.sql`
3. `supabase/migrations/003_vendor_enhancements.sql`
4. `supabase/migrations/004_production_orders.sql`
5. `supabase/migrations/005_ai_silhouette.sql`
6. `supabase/migrations/006_user_preferences.sql`
7. `supabase/migrations/007_teams_and_rls.sql`
8. `supabase/migrations/008_billing.sql`
9. `supabase/migrations/009_shopify.sql`

- **Storage bucket**: A public bucket named `mockups` must exist.
- **Auth**: "Confirm email" should be disabled in Auth settings.

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
```

### 3. Frontend (`la-guia/`)
```bash
cd la-guia
npm install
npm run dev
```

---

## API reference (`api/index.js`)

| Endpoint | Purpose |
|---|---|
| `/api/analyze-design` | Scores a captured canvas snapshot |
| `/api/generate-tech-pack` | Generates BOM + graded measurements from canvas |
| `/api/generate-silhouette` | Generates a stroke-only starting outline for a custom garment type |
| `/api/search-vendors` | Real-time web search via Tavily + Gemini extraction |
| `/api/shopify/auth` | Starts Shopify Custom App OAuth flow |
| `/api/shopify/fetch-orders` | Backend proxy to bypass CORS for Shopify order syncing |
| `/api/create-checkout-session` | Starts a Stripe Checkout session |

---

## Gotchas

- **Never commit `node_modules`.**
- **Shopify Redirection:** Ensure your Shopify App redirection URL is set to `http://localhost:3001/api/shopify/callback`.
- **Photopea resizing:** Use the capture/remount pattern in `DesignDetail.jsx`.
```

***

### Concisely Summarized Changes:
*   **Implemented Full Shopify Integration:** Added `SalesContext.jsx` for state management, backend OAuth/proxy endpoints in `api/index.js`, and de-mocked the `SalesDashboard.jsx` UI.
*   **Live Break-even Tracking:** Updated `ProductInsights.jsx` to pull real units-sold data from Shopify, showing a progress bar towards profitability.
*   **Fixed Styling Typos:** Corrected camelCase errors in `ProductInsights.jsx` that were causing the frontend to crash.
*   **Updated Schema:** Master `INITIAL_SCHEMA.sql` now includes `store_connections` and `sales_data` tables with strict RLS policies.
