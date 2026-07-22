# Atelier — Mobile app (Capacitor)

The web app is wrapped with [Capacitor](https://capacitorjs.com/) so the same
React/Vite codebase ships to the iOS App Store and Google Play. No UI rewrite —
the native app loads the built web bundle in a native shell.

## What's already set up in this repo
- `@capacitor/core`, `@capacitor/app`, `@capacitor/cli` installed.
- `capacitor.config.json` — `appId: app.atelierlabs`, `appName: Atelier`,
  `webDir: dist`. **Change `appId` before your first store submission** — it's
  the permanent bundle identifier and can't change after a listing exists.
- npm scripts: `mobile:sync`, `mobile:ios`, `mobile:android`.
- The WebGL intro is auto-skipped in the native app (too heavy on phones).

## Prerequisites (why platforms aren't added yet)
Native projects must be generated and built on the right OS:
- **iOS** → macOS + Xcode. Cannot be done on Windows.
- **Android** → Android Studio + SDK.

Run these once, on the appropriate machine:

```bash
cd la-guia
npm install
npm install @capacitor/ios @capacitor/android   # platform packages
npm run build                                    # produce dist/
npx cap add ios          # macOS only
npx cap add android
```

This creates `ios/` and `android/` native project folders. Commit them (or
gitignore and regenerate — team's choice).

## Build & run
```bash
cd la-guia
npm run mobile:sync      # vite build + cap sync (copies dist into native apps)
npm run mobile:ios       # opens Xcode → run on simulator/device
npm run mobile:android   # opens Android Studio → run
```
Re-run `npm run mobile:sync` after any web code change.

## ⚠️ Point the app at the production backend
The native app can't reach `localhost`. Build the mobile bundle with the live
API URL so `VITE_API_URL` is baked in:

```bash
VITE_API_URL=https://api.atelierlabs.app npm run mobile:sync
```
(Set the same in whatever build step / CI produces the mobile bundle.)

## OAuth (Google login) — deep links required
Supabase OAuth redirects back to the app via a custom URL scheme, not a normal
web redirect. Steps:

1. Pick a scheme, e.g. `app.atelierlabs://login-callback`.
2. Register it: iOS → `Info.plist` URL types; Android → intent-filter in
   `AndroidManifest.xml` (Capacitor docs show both).
3. In Supabase → Auth → URL Configuration, add that redirect URL.
4. Handle the inbound link in the app:

```js
import { App } from '@capacitor/app';
import { supabase } from './lib/supabase.js';

App.addListener('appUrlOpen', async ({ url }) => {
  if (url.includes('login-callback')) {
    const code = new URL(url).searchParams.get('code');
    if (code) await supabase.auth.exchangeCodeForSession(code);
  }
});
```
5. When starting OAuth on native, pass `redirectTo: 'app.atelierlabs://login-callback'`
   and `skipBrowserRedirect` per Supabase's mobile guide.

## ⚠️ In-app purchases vs Stripe (decide before submitting)
Apple (guideline 3.1.1) and Google require **their** in-app purchase systems for
digital goods sold inside the app — which your subscriptions and credit top-ups
are. Redirecting to Stripe Checkout from inside the iOS app risks rejection.
Options:
- **v1 (simplest):** keep all purchases on the web; the app shows balances and
  spends credits but sends users to the website to buy. (Apple still restricts
  linking out — read current "external purchase link" rules.)
- **Full:** implement StoreKit / Play Billing for in-app purchases and credit the
  same `brand_ai_credits` ledger from those receipts (~15–30% platform fee).

## Dev live-reload (optional)
For fast iteration against a running dev server, temporarily add to
`capacitor.config.json`:
```json
"server": { "url": "http://<your-lan-ip>:5173", "cleartext": true }
```
Remove it for production builds (the store build must bundle `dist`).

## Recommended next native touches
- `@capacitor/status-bar`, `@capacitor/splash-screen`, app icons.
- A responsive/touch pass — the desktop sidebar + dense tables need mobile layouts.
- `@capacitor/push-notifications` if you want native push.
