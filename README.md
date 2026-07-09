### `README.md`

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
│   │   ├── context/         AuthContext, ProductsContext, VendorsContext — all Supabase-backed
│   │   ├── lib/              Supabase client, formatters
│   │   └── pages/            One file per route
│   ├── .env.local           VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
│   └── package.json
├── api/                      Express backend — the only place secret keys are used
│   ├── index.js              All AI endpoints (Gemini + Tavily)
│   ├── .env                  GEMINI_API_KEY, TAVILY_API_KEY, PORT (not committed)
│   └── package.json
└── supabase/
    └── migrations/           SQL to run manually in the Supabase SQL Editor (see below)
```

**The split is deliberate:** the frontend talks to Supabase *directly* for all data (products, designs, vendors, quotes), protected by Row Level Security — no backend round-trip needed for CRUD. The Express backend (`api/`) exists **only** for calls that need a secret key that can't live in browser code (Gemini, Tavily). If a feature doesn't need a secret, it shouldn't go through `api/` — keep following that pattern.

**Design canvas:** the Design Studio embeds [Photopea](https://www.photopea.com) (a full Photoshop-compatible editor) via `postMessage`, not a custom-built canvas. Photopea's own Google Search grounding needs a billing-enabled Google Cloud project — confirmed by testing directly, not assumed — so vendor web search uses Tavily instead, feeding real results to Gemini for structuring.

---

## What's real vs. mock

The frontend was scaffolded with static mock data first, then converted page-by-page to real Supabase data. 

**Real (Supabase-backed):**
Auth · Brands · Products · Designs · Tech Packs · Collections · Materials · Vendors · Quotes · Production Orders (Creation & List view) · Readiness Review

**Still static mock data** (`la-guia/src/data/mockData.js`) — candidates for the next conversion pass:
`ProductionOrderDetail.jsx` (Hardcoded to mock data, crashes if given a real ID) · `SalesDashboard.jsx` · `ContentHub.jsx` · `NotificationsInbox.jsx` · `Home.jsx` (Notifications feed only)

---

## Local setup

### 1. Supabase project
You need access to the shared Supabase project (ask a teammate for the URL + anon key if you don't have them). Three things live there that aren't all in version control yet:

- **Tables**: `brands`, `products`, `designs`, `tech_packs`, `materials`, `collections`, `production_orders` were created directly via the Supabase dashboard early on and **aren't captured in a migration file** — if you need to know the exact schema, check the dashboard directly (worth fixing: export these as a `001_initial_schema.sql` at some point).
- **`vendors` and `quotes` tables**: *are* version-controlled. Run these in the SQL Editor, in order, if they haven't been run yet:
  ```
  supabase/migrations/002_vendors_and_quotes.sql
  supabase/migrations/003_vendor_enhancements.sql
  ```
- **Storage bucket**: a public bucket named `mockups` must exist (Storage → New bucket → name it `mockups`, public). This is where captured Design Studio snapshots get uploaded when generating a tech pack. Without it, "Auto-Generate Tech Pack" fails on the upload step.
- Auth: "Confirm email" should be disabled in Auth settings for frictionless local testing.

### 2. Backend (`api/`)
```bash
cd api
npm install
```
Create `api/.env`:
```
PORT=3001
GEMINI_API_KEY=your_key_from_ai_studio
TAVILY_API_KEY=your_key_from_tavily.com
```
- Gemini key: [aistudio.google.com](https://aistudio.google.com) — free tier is fine for everything currently built (plain `generateContent` calls only; nothing here uses Search grounding, which needs billing).
- Tavily key: [tavily.com](https://tavily.com) — free tier (~1,000 searches/month), no card required. Only needed for vendor search (`/api/search-vendors`); everything else works without it.

Run it:
```bash
node index.js
```

### 3. Frontend (`la-guia/`)
```bash
cd la-guia
npm install
```
Create `la-guia/.env.local`:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
Run it:
```bash
npm run dev
```

Open **http://localhost:5173**. You need both servers running — the frontend alone covers everything except the AI-powered features (design analysis, tech pack generation, vendor parsing/search/fit scoring, email drafting), which call `http://localhost:3001` directly (hardcoded for now — worth moving to an env var if this ever needs to run somewhere other than localhost).

---

## API reference (`api/index.js`)

All endpoints are `POST`, take/return JSON, and follow the same shape: `{ ok: true, ...data }` or `{ ok: false, error: "..." }`.

| Endpoint | Purpose | Needs |
|---|---|---|
| `/api/analyze-design` | Scores a captured canvas snapshot (feasibility, proportion, catalog overlap) | image (base64) |
| `/api/generate-tech-pack` | Generates BOM + graded measurements from a canvas snapshot | image (base64) |
| `/api/parse-vendor` | Extracts a structured vendor profile from pasted text (link/email/notes) | text |
| `/api/search-vendors` | Real-time web search for manufacturers via Tavily, then Gemini extracts + classifies results | Tavily key |
| `/api/analyze-vendor-fit` | Scores how well a vendor fits a specific product (materials, MOQ-vs-budget economics, risk) | vendor + product + BOM |
| `/api/draft-vendor-email` | Drafts a subject/body for a vendor email — frontend opens it via `mailto:`, no send/receive built | vendor + context |

**`/api/search-vendors` specifics worth knowing:**
- Runs two parallel Tavily searches (your exact query + a loosened fallback) so there's always a pool to draw from
- The prompt has an explicit, strict filter to exclude retail clothing *brands* and only return manufacturers-for-hire — this took real iteration to get right; if search quality regresses, check this prompt first
- Live-checks each result for parked/expired-domain signals before returning it
- Distinguishes a vendor's own site from a third party *reviewing* a vendor (e.g. an Instagram account), and extracts a vendor's real site from within review text when possible

**`/api/analyze-vendor-fit` requires a product budget to be set** — it returns a 400 rather than analyzing against nothing. Budget is set from the Vendor Detail page's fit-analysis card (there's no dedicated product-budget field elsewhere yet).

---

## Known gaps / next up

- **Mock Data Bleed:** `ProductionOrderDetail.jsx` needs to be refactored to remove dependencies on `mockData.js` and use Supabase data.
- **AI Text-to-Silhouette Generation:** The UI allows users to request an AI-generated silhouette, but the backend implementation to convert text to SVG is missing.
- **Schema Migrations:** Export the `brands`/`products`/`designs`/`tech_packs`/`materials`/`collections`/`production_orders` schema as a real `001_initial_schema.sql` migration file.
- **Environment Variables:** `http://localhost:3001` is hardcoded in several frontend files — fine for local dev, will need an env var before any real deployment.
- **Production Hosting:** No production hosting/deploy setup yet — this is entirely local dev right now.

## Gotchas (read before you lose an hour to one of these)

- **Never commit `node_modules`.** It happened once already (thousands of files, made the repo slow to clone) — both `.gitignore` files exclude it now, but if you ever see it show up in `git status`, stop and check before committing.
- **Gemini Search grounding needs billing** — confirmed by direct testing (429 on the free tier regardless of tool schema used). Don't reach for it; use Tavily + a plain Gemini call instead, per `/api/search-vendors`.
- **Photopea's own layout doesn't reliably resize** after its container changes size (confirmed live) — the fullscreen toggle works around this by capturing the canvas, remounting Photopea fresh at the new size, and reopening the capture. If you touch the Design Studio canvas, keep that pattern rather than just resizing the iframe.
- **Two dev servers, two `.env` files** — `api/.env` (backend secrets) and `la-guia/.env.local` (frontend, Supabase only — anon key is safe to expose client-side by design). Never put the Gemini or Tavily key in a `VITE_`-prefixed variable; that would ship it to the browser.
```