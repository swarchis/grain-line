1. README.md

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
│   │   ├── context/         Auth, Products, Vendors, Production, Notifications, Sales, Team (Supabase-backed)
│   │   ├── lib/             Supabase client, formatters
│   │   └── pages/            One file per route
│   ├── .env.local           VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
│   └── package.json
├── api/                      Express backend — the only place secret keys are used
│   ├── index.js              All AI endpoints (Gemini + Tavily) + Integration Proxy + Email (Resend)
│   ├── .env                  GEMINI_API_KEY, TAVILY_API_KEY, STRIPE_SECRET_KEY, SHOPIFY_CLIENT_ID, RESEND_API_KEY (not committed)
│   └── package.json
└── supabase/
    └── migrations/           SQL Schema for your Supabase project

The split is deliberate: the frontend talks to Supabase directly for all data
(products, designs, vendors, quotes, etc.), protected by Row Level Security — no
backend round-trip needed for CRUD. The Express backend (api/) exists only for
calls that need a secret key that can't live in browser code (AI, Shopify,
Stripe, Resend).

What's real vs. mock

The frontend was scaffolded with static mock data first, then converted
page-by-page to real Supabase data.

Real (Supabase-backed): Auth · Brands (multi-brand support) · Products · Designs
(AI-generated silhouettes) · Tech Packs (BOM, Measurements, Sampling Checklist)
· Collections · Materials (Library & Usage Analysis) · Vendors · Quotes ·
Production Orders · Notifications · Settings · Team permissions (Automated
Invites via Resend) · Sales Dashboards (Shopify Integration) · Product
Performance (Live Break-even tracking)

Real, needs your own keys: Billing (Stripe) · Sales Data (Shopify Custom App) ·
Team Invites (Resend API)

Still static mock data (la-guia/src/data/mockData.js): ContentHub.jsx

Local setup

1. Supabase project

You need access to your Supabase project. Run the migrations in order (see
supabase/migrations/).

  - Storage bucket: A public bucket named mockups must exist.
  - Auth: "Confirm email" should be disabled in Auth settings.

2. Backend (api/)

cd api
npm install
node index.js

Create api/.env:

PORT=3001
GEMINI_API_KEY=...
TAVILY_API_KEY=...
STRIPE_SECRET_KEY=...
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
RESEND_API_KEY=...

3. Frontend (la-guia/)

cd la-guia
npm install
npm run dev

API reference (api/index.js)

| Endpoint                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `/api/analyze-design`          | Scores a captured canvas snapshot                |
| `/api/generate-tech-pack`      | Generates BOM + graded measurements from canvas  |
| `/api/generate-silhouette`     | Generates a custom starting outline              |
| `/api/search-vendors`          | Real-time web search via Tavily + Gemini         |
| `/api/shopify/auth`            | Starts Shopify OAuth flow                        |
| `/api/send-invite`             | Dispatches teammate invitation emails via Resend |
| `/api/create-checkout-session` | Starts a Stripe Checkout session                 |

Gotchas

  - Never commit node_modules.
  - Resend Testing: On the free tier without a verified domain, Resend only
    allows sending emails to the address you signed up with.
  - Vite Import Errors: Ensure TeamContext.jsx and SignUp.jsx are in their
    respective correct folders (src/context and src/pages/auth) to avoid path
    resolution errors.


***
