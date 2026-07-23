# Atelier — Launch Checklist (in depth)

Work top to bottom. Items marked **[ask Claude]** are code changes Claude does —
everything else needs your accounts/dashboards. Each item ends with a
**Verify** step — don't check the box until it passes.

---

## 🔴 Tier 1 — Blocks charging real money (~1–2 hours)

### 1. Stripe webhook (test mode)
The billing loop's missing piece: without it, subscriptions don't auto-grant
credits and paid top-ups never credit.

1. In a terminal: `cd api && node scripts/setup-stripe-webhook.js`
   - Creates the endpoint at `https://api.atelierlabs.app/api/stripe/webhook`
     subscribed to `invoice.paid`, `customer.subscription.deleted`,
     `checkout.session.completed`. Safe to re-run (it updates, never duplicates).
2. Copy the printed `STRIPE_WEBHOOK_SECRET=whsec_...` value.
3. Railway → your project → the **backend service** → **Variables** →
   **+ New Variable** → `STRIPE_WEBHOOK_SECRET` = `whsec_...` → save.
   Railway redeploys itself.

**Verify:** buy the smallest credit pack with test card `4242 4242 4242 4242`
→ balance increases within ~10s of returning to Settings. In Stripe →
Developers → Webhooks → endpoint, deliveries show **200** (not 400).

### 2. Railway environment variables (one visit, five variables)
Railway → backend service → **Variables**. Set / confirm ALL of these:

| Variable | Value | Why it matters |
|---|---|---|
| `APP_URL` | `https://atelierlabs.app` | Stripe checkout success/cancel and every OAuth callback redirect here. **Unset = customers redirected to localhost after paying.** |
| `API_URL` | `https://api.atelierlabs.app` | OAuth flows that bounce through the API. |
| `ALLOWED_ORIGINS` | `https://atelierlabs.app` | Locks CORS to your frontend (backend currently warns on every boot). Comma-separate if you add `www.`. |
| `STRIPE_WEBHOOK_SECRET` | from step 1 | Webhook signature verification. |
| `OAUTH_STATE_SECRET` | any long random string (e.g. run `openssl rand -hex 32` or mash 40+ random characters) | Signs OAuth handoff state. **Currently falls back to a publicly-visible dev default in the repo — forgeable.** |

**Verify:** after redeploy, Railway logs no longer show the
`ALLOWED_ORIGINS not set` warning.

### 3. Stripe live mode (do LAST, after the dress rehearsal)
Test and live are parallel universes — keys, products, webhooks all separate.

1. Stripe Dashboard → toggle **Test mode OFF** → complete business/bank
   activation if you haven't.
2. Get the **live** secret key (Developers → API keys → `sk_live_...`).
3. Locally, temporarily put the live key in `api/.env` as `STRIPE_SECRET_KEY`,
   then run `node scripts/setup-stripe-products.js` → copy the **live**
   `STRIPE_PRICE_BASIC` / `STRIPE_PRICE_PREMIUM` ids it prints.
4. Run `node scripts/setup-stripe-webhook.js` again (still with the live key
   in `.env`) → copy the **live** `whsec_...`.
5. In Railway, replace all four: `STRIPE_SECRET_KEY` (live),
   `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PREMIUM`, `STRIPE_WEBHOOK_SECRET` (live).
6. Put your **test** key back in your local `api/.env` so local dev stays in
   test mode.
7. Optional but recommended: Stripe → Settings → Emails → turn on customer
   receipts; look at Settings → Tax if you need tax collection.

**Verify:** one real purchase of the smallest credit pack with a real card,
watch credits land, then refund yourself in the Stripe dashboard.

---

## 🟠 Tier 2 — Launch-day quality

### 4. Supabase auth emails + URLs (~30 min)
Default confirmation/reset emails come from Supabase's shared sender —
rate-limited (~3/hour) and spam-prone. Also the auth redirect URLs must know
your production domain.

1. **URL configuration:** Supabase Dashboard → Authentication →
   **URL Configuration** → Site URL = `https://atelierlabs.app`; add
   `https://atelierlabs.app/**` to Redirect URLs.
2. **Custom SMTP** (do item 5 first — it gives you the SMTP credentials):
   Authentication → **SMTP Settings** (under Auth settings) → enable custom
   SMTP with Resend: host `smtp.resend.com`, port `465`, username `resend`,
   password = your Resend API key, sender = `Atelier <auth@atelierlabs.app>`.
3. **Templates** (optional polish): Authentication → Email Templates —
   confirmation/reset emails currently say "Supabase"; reword to Atelier.

**Verify:** sign up with a fresh email → confirmation arrives from
`auth@atelierlabs.app`, lands in inbox not spam, and the link returns to
atelierlabs.app.

### 5. Resend domain verification (~30 min, mostly DNS waiting)
Invites/campaigns currently send from `onboarding@resend.dev` — a test sender
that only delivers to YOUR OWN email address. **Team invites to anyone else
silently fail today.**

1. resend.com → **Domains** → Add Domain → `atelierlabs.app`.
2. Resend shows 3–4 DNS records (SPF TXT, DKIM CNAMEs/TXT). Add each in
   **Cloudflare → your domain → DNS**. For DKIM CNAMEs set proxy status to
   **DNS only** (grey cloud).
3. Wait for Resend to show **Verified** (minutes to an hour).
4. **[ask Claude]** — update the two `from:` addresses in `api/index.js`
   from `onboarding@resend.dev` to e.g. `Atelier <invites@atelierlabs.app>`.

**Verify:** invite a teammate on a different email provider (Gmail if you're
on Outlook, etc.) → invite arrives in inbox.

### 6. Google OAuth for production (~20 min)
1. [console.cloud.google.com](https://console.cloud.google.com) → your OAuth
   project → **APIs & Services → Credentials** → your OAuth 2.0 Client.
2. **Authorized JavaScript origins:** add `https://atelierlabs.app`.
3. **Authorized redirect URIs:** add your Supabase callback —
   `https://<your-project-ref>.supabase.co/auth/v1/callback` (shown in
   Supabase → Authentication → Providers → Google).
4. **OAuth consent screen** → set to **In production** (not Testing — testing
   mode caps you at 100 hand-added users and expires sessions weekly).
   Google may ask for verification if you request sensitive scopes; basic
   sign-in scopes usually pass without review.

**Verify:** log out → "Continue with Google" from atelierlabs.app on a
browser you're not already authed in → lands back in the app signed in.

### 7. SEO / meta tags — **[ask Claude]**
`index.html` has no description, OG tags, or social card, so a shared link
renders bare. Claude adds: meta description, OG/Twitter cards, canonical URL,
theme color, and a proper OG image (needs one 1200×630 image from you, or a
generated placeholder).

### 8. Error monitoring (~30 min)
1. sentry.io → create account → two projects: **React** and **Node/Express**.
2. Copy both DSNs.
3. **[ask Claude]** — wire `@sentry/react` + `@sentry/node` with the DSNs
   (frontend DSN goes in Cloudflare Pages env as `VITE_SENTRY_DSN`, backend
   DSN in Railway as `SENTRY_DSN`).

**Verify:** throw a test error on staging → appears in Sentry within a minute.

### 9. The dress rehearsal (~1 hour, the most valuable hour on this list)
Fresh browser profile, brand-new email, act like a stranger:

1. Land on atelierlabs.app → read the landing page cold. Confusing anywhere?
2. Sign up (email + Google, both) → onboarding walkthrough.
3. Create a design from a template → draw → Save → reload → work restored?
4. Generate an AI silhouette → correct? single garment, no people?
5. Tech pack via questionnaire → review output quality honestly.
6. Add a vendor manually + run one AI vendor search → request a quote.
7. Request a sample → log fit feedback.
8. Create a production order → log an update/issue → mark shipped.
9. Connect a [Shopify dev store](https://partners.shopify.com) (free) →
   pull orders.
10. Invite a teammate → accept from the other account → check permissions.
11. Run out of credits on purpose → out-of-credits modal → buy a test pack.
12. Everything on your phone browser once (this feeds the responsive pass).

Write down every point of friction — hand the list to Claude.

### 10. Responsive/mobile pass — **[ask Claude, ~a day]**
Desktop-only today. Claude does the layout work; you review on a real phone.
Do after the dress rehearsal so known frictions fold into the same pass.

---

## 🟡 Tier 3 — Scope decisions before you market features

### 11. Social integrations (ContentHub)
Backend expects credentials for each platform; every one needs a developer
app registration, and Meta (Instagram) + TikTok involve app review measured
in **weeks**:

- **Instagram:** developers.facebook.com → business app → Instagram Graph API
  → app review for publishing scopes. Longest lead time.
- **TikTok:** developers.tiktok.com → app → Content Posting API → audit.
- **YouTube:** Google Cloud → YouTube Data API v3 → OAuth scopes (may add
  verification requirements to item 6's consent screen).
- **Pinterest:** developers.pinterest.com → app → trial then standard access.

**Recommendation:** launch with ContentHub's connect buttons behind a
"Coming soon" state (**[ask Claude]** — small change), start the Meta and
TikTok registrations NOW in parallel, un-gate as approvals land. Env var
names the backend expects: `INSTAGRAM_CLIENT_ID/SECRET`,
`TIKTOK_CLIENT_KEY/SECRET`, `YOUTUBE_CLIENT_ID/SECRET`,
`PINTEREST_CLIENT_ID/SECRET`.

### 12. E-commerce credentials
- **Shopify:** partners.shopify.com → Apps → Create app →
  redirect URL `https://api.atelierlabs.app/api/shopify/callback` →
  copy client id/secret → Railway `SHOPIFY_CLIENT_ID/SECRET`. A custom/dev
  app works for early users; public app listing (with review) can wait.
- **Etsy:** etsy.com/developers → create app → keystring → Railway
  `ETSY_KEYSTRING`; callback `https://api.atelierlabs.app/api/etsy/callback`.
- **WooCommerce:** nothing to register — users paste their own keys. Works today.

### 13. Credit-system smoke tests — **[ask Claude, post-launch #1]**
Grant/debit/refund/top-up tests against a scratch database. The credit system
touches money; a regression there costs real dollars and trust.

---

## 🟢 Post-launch
- Capacitor mobile builds (needs a Mac for iOS + the Apple-IAP-vs-Stripe
  decision — see `la-guia/MOBILE.md`).
- Supabase Pro for point-in-time backups (free tier = daily only).
- `api/index.js` modular split once tests exist.
- Product analytics (PostHog free tier is the usual pick) if you want funnel
  data.

## Suggested order
1 → 2 (tonight, ~1 hr) → 5 → 4 → 6 (one sitting, DNS waits overlap) →
7 + 8 (Claude, parallel) → 9 dress rehearsal → 10 responsive pass →
fix-list → 3 go live → announce. Start 11's Meta/TikTok registrations on
day one — they're the long pole.
