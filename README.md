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
Auth · Brands (multi-brand — a user can own or belong to several, switching reloads every context) · Products (with favoriting and permanent delete) · **Product Management** (categories, colorway/size SKU matrix, duplicate, archive/status, lifecycle history — see below) · Designs (including AI-generated silhouettes) · Tech Packs (BOM, Measurements, Sampling Checklist — deletable independently of the design) · Collections (deletable — un-groups its products rather than deleting them) · Materials (Library & Usage Analysis, deletable) · **Vendor Platform** (structured search, certifications/capabilities/price, comparison — see below) · Quotes · Production Orders · Notifications · Settings · Team members & permissions (invite-by-email with automated Resend delivery) · User preferences (theme, onboarding state) · Command palette / global search (entity content **and** sidebar pages) · Keyboard shortcuts · Onboarding walkthrough (auto-scrolls the highlighted feature into view, first-visit only) · Personalized Home dashboard (Continue where you left off, AI suggestions, Project health, Favorite projects, Calendar timeline, Recent activity, Upcoming deadlines, Quick actions, a Suggestion Inbox for feedback/bug reports, the hero card's pinned photo now shows the featured product's actual tech pack image/design snapshot instead of the placeholder texture once one exists) · **Team Chat & AI Assistant** (see below) · the hero's "Working sketch" is a real type-or-draw sticky note with 3-slot swap storage, pencil/eraser tools, and a full clear action (not decorative) · Sales Dashboard & product break-even tracking (Shopify integration) · **AI Design Studio** (see below)

Every delete (design, tech pack, material, collection) goes through `ConfirmDeleteModal` (`la-guia/src/components/ConfirmDeleteModal.jsx`) — a deliberate trash-icon click opens it, and the actual delete button stays disabled until you type the item's exact name, so an accidental click or stray Enter key can't finish it.

**AI Design Studio** (`la-guia/src/components/design-studio/`, opened as tabs on a Design's detail page): real image generation, split across two providers by what each tool actually needs to do —

- **Transform tools** (sketch-to-design, AI text edit, background remover, recolor, fabric swap, mockup generator, flat sketch, alternate views) edit the founder's *actual* existing design, so they run on Gemini's image model (`/api/design/ai-image`, one mode-specific prompt template per tool) — it's the one that can take a reference image and hand back a faithfully edited version. Applying a result replaces the canvas outright, since these are genuinely whole-image changes (there's no partial "layer" for "this garment is now green").
- **Addition tools** (Add Element, Pattern Generator) generate a brand-new, isolated element with no reference to the existing design at all — these run on Stable Diffusion via Pixazo (`/api/design/generate-element`, base SDXL through `https://gateway.pixazo.ai/getImage/v1/getSDXLImage`). A result never overwrites anything: it's either inserted as a genuinely new, movable/deletable Photopea layer (`PhotopeaEditor.addLayer`, uses Photopea's own `app.open(url, "", true)` smart-object-layer behavior) or downloaded as a transparent PNG for anyone working in Photoshop/Illustrator instead of the in-app canvas. Pixazo's SD models are text-to-image only (confirmed against their docs) — there's no SD endpoint that can take your existing design as input, which is why the transform tools couldn't move here too.

Also real: a moodboard (uploaded reference images), an AI color palette generator, AI trend inspiration (Tavily-grounded, cached once per category per day), AI-generated design variants, version history (every saved AI result), and a comment thread — all Supabase-backed per design. AI design critique (`/api/analyze-design`, scores a canvas snapshot) predates this and lives on the Canvas tab.

**Tech Pack Builder** (`la-guia/src/pages/TechPackDetail.jsx`): opening a tech pack for the first time shows an intake questionnaire (`TechPackQuestionnaire.jsx`) — free-text answers per section (materials, sizing, construction, print placements, trims, labels, packaging, material usage, manufacturing/compliance notes, plus a catch-all "other" field), with two paths out of it: **"Generate with AI"** (`/api/generate-tech-pack-full`, Gemini fills every section from the answers + garment category, always shown next to an explicit "won't always be accurate" warning) or **"Start blank / from my answers"** (each non-empty answer seeds one real row in the corresponding table, no AI involved). Every section is a real editable table after that — construction, print placements, trims, labels, packaging, material usage, manufacturing notes, compliance notes, on top of the pre-existing BOM/measurements/sampling checklist — via a shared `EditableSectionTable` component. Also real: a missing-information banner on Overview (checks every section, not just the ones that feed the readiness score), an approval workflow (draft → pending → approved/rejected, gated on team role for the approve/reject step), version history (manual "Save version" snapshots the whole tech pack, restorable), PDF export (existing print-CSS layout, extended to cover every new section), and CSV export ("Export Excel" in the UI — deliberately CSV under the hood, not the `xlsx` npm package, which has open high-severity prototype-pollution/ReDoS advisories on its last published version; CSV opens natively in both Excel and Sheets with zero added dependency risk).

I did not build the "AI edits a template image sourced from online" version of this — sourcing and rights-clearing a real tech pack template isn't something I can do reliably, and a structured, per-section editable document (what's built) is more useful for actually editing/exporting than an image with parts erased by AI. This matches the fallback you offered ("can also be done in Google Sheets or Excel if it's easier").

**Product Management** (`la-guia/src/context/ProductsContext.jsx`, `la-guia/src/pages/Design.jsx`, `la-guia/src/pages/DesignDetail.jsx`, `la-guia/src/pages/Settings.jsx`): no AI here — categories, colorways, sizes, SKUs, status, and lifecycle history are all deterministic data, not AI decisions. Brand-level **Categories** are managed from Settings > Brand Details and pickable per-product from the Design detail page. A design's **SKUs & Variants** tab lets you build a colorway × size matrix and generate real SKUs (`la-guia/src/lib/sku.js`, format `{BRAND}-{CATEGORY}-{PRODUCT}-{COLOR}-{SIZE}`, pure string formatting — nothing calls out to AI for this) into a `product_variants` table; "Generate SKUs" only fills in missing combinations, so relabeling a colorway or adding a size never touches SKUs that already exist. **Duplicate** clones a product's row and its design (not its tech pack or variants — those are meant to be built fresh for the copy). **Archive** sets `products.status` and moves the product out of the default list into a separate "Show archived" view on Design.jsx and DesignDetail's Details panel; `discontinued` is a status too but, unlike `archived`, doesn't get hidden — it's still meant to show up in Kanban/history. Every `stage` change (Kanban move, new design, duplicate) is best-effort logged to `product_stage_history` for a real lifecycle audit trail, without ever blocking the actual move if the write fails.

Note: the existing "Variants" tab on a design (AI-generated *image* variants, from AI Design Studio) was renamed to **"Image Variants"** to avoid colliding with the new SKU/colorway "Variants" concept — same feature, same data, just relabeled.

**Vendor Platform** (`la-guia/src/pages/VendorDiscovery.jsx`, `VendorDetail.jsx`, `la-guia/src/context/VendorsContext.jsx`): vendor search now takes structured fields (material/style keywords, category, location, plus an "Advanced filters" panel for quantity, max MOQ, target unit price, and certifications) instead of one opaque text box — `/api/search-vendors` builds a sharper Tavily query from whichever fields are actually filled in, and the Gemini extraction prompt now also pulls certifications, factory capabilities, and a price range out of real search results (never estimated — left blank if the source text doesn't state one). A design's **"Find Vendors for this Design"** button (on `DesignDetail.jsx`'s Details panel) captures the current canvas snapshot and hands it, plus the design's category, to a pre-filled vendor search — the image is passed straight into the same Gemini call so it can weigh a candidate's fit against the actual garment's construction/fabric weight, not just a text description of it. Saved vendors have a prominent, inline-editable **price range** (shown large on the vendor card, row, and detail page — this was explicitly asked to be a bigger visual element than the rest of the profile), an editable certifications/capabilities/specialties tag set, a manual **onboarding stage** (prospect → contacted → sampling → onboarded), and a manual **verification** toggle with notes — verification is a human trust judgment about a real-world business relationship, so it's founder-set, never AI-decided. A new **Compare tab** lets you check up to 5 saved vendors (from Discover or Favorites) and view them side by side in a table, price as the standout row, everything else (rating, MOQ, lead time, certifications, capabilities, onboarding stage, verification, quotes exchanged) underneath. `VendorDetail.jsx` also now shows a **Performance history** section — quotes requested/accepted/acceptance-rate and linked production orders — computed from real `quotes`/`production_orders` rows, not a fabricated score.

**Readiness gate bypass:** the two "80%+ factory readiness required" hard gates (starting a production order in `ProductionOrders.jsx`, requesting a quote in `VendorDetail.jsx`) are no longer absolute — when a product is under 80%, an explicit "I understand the risks and want to proceed anyway" checkbox appears next to the warning and unblocks the button once checked. The gate still defaults to blocking and resets itself whenever a different product is selected, so it stays a deliberate, one-time-per-attempt override rather than something that quietly stays bypassed.

**Team Chat & AI Assistant** (`la-guia/src/components/FloatingChat.jsx`, `la-guia/src/context/ChatContext.jsx`, mounted once in `App.jsx`'s shell so it persists across every page): a circular button in the bottom-right corner opens a panel with two kinds of real, Supabase-backed conversations. Every founder gets one personal **AI Assistant** chat (`chats.type = 'ai'`) — `/api/chat-reply` grounds its replies in a text summary of the brand's own products/vendors/quotes/production-orders/materials (the same "client assembles context, server just prompts" shape `/api/dashboard-suggestions` already used), gated behind `useAIUsage()` like every other AI feature, and it says so plainly when the brand data it was given doesn't answer the question rather than guessing. The rest are real **group chats** with any combination of teammates (`chats.type = 'group'`) — pick anyone from the brand's active team members (including an "Add everyone" shortcut), no cap on participants. Visibility is enforced per-chat-membership in Postgres RLS (a new `is_chat_member()` helper), not just brand membership, so teammates on the same brand can't read each other's AI conversations or a group chat they weren't added to. There's no realtime infrastructure anywhere else in this app, so group chats poll for new messages every 8s while a thread is open rather than introducing Supabase Realtime as a one-off.

**Real, needs your own keys to actually process/send:**
Billing & subscription plans (Free / Basic / Premium) — real Stripe Checkout, Customer Portal, and plan-limit enforcement (active products, team seats, AI generations/month). Sales data — real Shopify Custom App OAuth. Team invite emails — real Resend delivery (see Gotchas below for its free-tier limits). AI Design Studio's transform tools need `GEMINI_API_KEY` to have access to the `gemini-2.5-flash-image` model specifically (a paid/billed model, distinct from the free-tier-friendly `gemini-flash-lite-latest` used everywhere else in this repo); its addition tools need a `PIXAZO_API_KEY` — see Gotchas for both. A handful of Premium feature lines are marked "Coming soon" in the UI — real marketing copy for where the tier is headed, not built into the app yet.

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
11. `supabase/migrations/011_design_studio.sql` — **required** for AI Design Studio and the Home dashboard's sticky notes: adds `moodboard`/`palette`/`variants` columns to `designs`, new `design_versions` and `design_comments` tables (with RLS), and a new `brand_notes` table (with RLS) for the 3-slot sticky notes.
12. `supabase/migrations/012_feedback.sql` — **required** for the Home dashboard's Suggestion Inbox: new `feedback_submissions` table (with RLS).
13. `supabase/migrations/013_tech_pack_builder.sql` — **required** for the Tech Pack Builder: adds `construction`/`print_placements`/`trims`/`labels`/`packaging`/`material_usage`/`manufacturing_notes`/`compliance_notes`/`questionnaire`/approval columns to `tech_packs`, and a new `tech_pack_versions` table (with RLS).
14. `supabase/migrations/014_product_management.sql` — **required** for Product Management: a new `categories` table (with RLS), `status`/`colorways`/`sizes` columns on `products`, and new `product_variants`/`product_stage_history` tables (with RLS). The frontend degrades gracefully without it (falls back to an unfiltered product list and empty category list) so an out-of-date DB won't blank the whole app, but Categories, SKUs & Variants, Archive, and lifecycle history won't work until it's run.
15. `supabase/migrations/015_vendor_platform.sql` — **required** for the Vendor Platform: `certifications`/`capabilities`/`price_range`/`verified`/`verified_notes`/`onboarding_stage` columns on `vendors`.
16. `supabase/migrations/016_chat.sql` — **required** for Team Chat & the AI Assistant: new `chats`/`chat_participants`/`chat_messages` tables (with RLS keyed off per-chat membership, not just brand membership, via a new `is_chat_member()` helper) and the floating chat button won't load without it.

Migrations 002–016 use `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`, so they're safe no-ops on a DB that already has those columns — run them anyway on a fresh project, in order.

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
PIXAZO_API_KEY=...
```
`STRIPE_PRICE_BASIC`/`STRIPE_PRICE_PREMIUM` get written into this same file automatically by the billing setup script below.

**Pixazo** (AI Design Studio's addition tools only): get a key from [api-console.pixazo.ai](https://api-console.pixazo.ai/api_keys) and add it as `PIXAZO_API_KEY`. Sent as an `Ocp-Apim-Subscription-Key` header, not `Authorization` — see `callPixazoElement` in `api/index.js` if you're swapping providers again. The API loads `api/.env` first and also tolerates keys placed in `la-guia/.env.local`; restart `node index.js` after changing either env file.

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
| `/api/generate-tech-pack` | Generates BOM + graded measurements from canvas (used by DesignDetail's quick "Auto-Generate Tech Pack") |
| `/api/generate-tech-pack-full` | Tech Pack Builder's questionnaire-driven generator — `{ imageBase64?, category, answers }`, returns every section (BOM, measurements, construction, print placements, trims, labels, packaging, material usage, notes) |
| `/api/generate-silhouette` | Generates a stroke-only starting outline for a custom garment type not in the preset library |
| `/api/parse-vendor` | Extracts structured profile (incl. certifications, capabilities, price range) from pasted text |
| `/api/search-vendors` | `{ keywords?, category?, location?, quantity?, moq?, targetPrice?, certifications?, imageBase64? }` — structured-filter web search via Tavily + Gemini extraction (certifications/capabilities/price range included), optionally weighted by an attached design image |
| `/api/analyze-vendor-fit` | Scores vendor/product material & economic fit |
| `/api/draft-vendor-email` | Drafts a structured vendor outreach email |
| `/api/dashboard-suggestions` | Generates 2–4 short, data-grounded suggestions for the Home dashboard's AI suggestions widget |
| `/api/chat-reply` | `{ message, history, brandContext }` — conversational reply for the floating AI Assistant chat, grounded in a client-assembled brand data summary |
| `/api/create-checkout-session` | Starts a Stripe Checkout session for a plan upgrade |
| `/api/confirm-checkout` | Verifies a completed Checkout session before the frontend writes the new plan |
| `/api/create-portal-session` | Opens Stripe's Customer Portal for managing/cancelling a subscription |
| `/api/subscription-status` | Reconciles a brand's plan against the live Stripe subscription status |
| `/api/shopify/auth` | Starts the Shopify OAuth flow for a brand |
| `/api/shopify/callback` | Completes Shopify OAuth and stores the access token |
| `/api/shopify/fetch-orders` | Pulls recent orders for Sales Dashboard analytics |
| `/api/send-invite` | Dispatches teammate invitation emails via Resend |
| `/api/design/ai-image` | AI Design Studio's **transform** endpoint (Gemini) — `{ mode, prompt, images }`, one of 9 modes (sketch-to-design, ai-edit, bg-remove, recolor, fabric-swap, mockup, flat-sketch, view, variant), edits the given reference image, returns base64 |
| `/api/design/generate-element` | AI Design Studio's **addition** endpoint (Stable Diffusion / Pixazo base SDXL) — `{ mode, prompt }`, mode is `add-element` or `pattern`, no reference image, returns base64 with a near-white background punched to transparency |
| `/api/design/color-palette` | Suggests a 5-color palette from a design image or a text brief |
| `/api/design/trend-inspiration` | Tavily-grounded design trend research for a garment category |

---

## Known gaps / next up

- **Phase 3:** Sales Dashboard now pulls real Shopify orders where connected; break-even/product-performance math still assumes a connected store — brands without one see the dashboard shaped around what it looks like once they connect.
- **Task 4.1:** Inventory risk math engine based on sales velocity and brand risk profile — now unblocked by real Shopify order data, not yet built.
- **Home dashboard:** the AI suggestions widget is cached once per brand per calendar day (a manual "Refresh" re-runs it) so opening the dashboard doesn't silently spend AI usage on every visit.

## Gotchas

- **Never commit `node_modules`.**
- **Gemini Search grounding needs billing** — use Tavily instead.
- **AI Design Studio needs `gemini-2.5-flash-image` access on your `GEMINI_API_KEY`** — this is a separate, billed image-generation model from `gemini-flash-lite-latest` (used for every other AI feature in this repo, and usable on Gemini's free tier). If the key doesn't have access, every **transform** tool (sketch-to-design, edit, background remover, recolor, fabric swap, mockup, flat sketch, views, variants) will fail with a Gemini API error surfaced inline in that tool's card — check your Google AI Studio billing if that happens.
- **AI Design Studio's addition tools (Add Element, Pattern Generator) need `PIXAZO_API_KEY`**, separately from Gemini — missing/invalid key surfaces as an inline error in those two tool cards specifically, not the transform ones. Pixazo's Stable Diffusion endpoints are text-to-image only (no `image`/`init_image` parameter on SD 3.5, 3.0, XL, or XL Lightning) — confirmed directly against their docs before building this, so don't try to route a transform tool through Pixazo later without re-checking; only their separate mask-based Inpainting endpoint takes an image, and that's a different interaction model (needs a mask) than "edit this whole design." The app currently uses Pixazo's base SDXL endpoint because the Lightning endpoint returned a 403 insufficient-balance response for this key while base SDXL succeeded.
- **Photopea resizing** — the container doesn't reliably resize; use the capture/remount pattern in `DesignDetail.jsx`.
- **Resend testing** — on the free tier without a verified domain, Resend only allows sending emails to the address you signed up with; invites to any other address will silently fail to deliver (the `brand_members` row is still created correctly).
- **RLS was off almost everywhere before `007_teams_and_rls.sql`** — if you forked this project earlier and skipped that migration, any authenticated client could read/write any brand's data. Run it.
- **"Continue where you left off" is tracked in `localStorage`**, per brand, per browser — it doesn't sync across devices since there's no server-side "last viewed" column.
- **Sticky notes' "active slot" (which of the 3 notes is shown large) is tracked in `localStorage`** too, per brand, per browser, for the same reason — the note *content* is real and synced via `brand_notes`, only which one is currently "large" is local.
