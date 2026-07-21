// api/scripts/setup-stripe-webhook.js
//
// Creates (or reports) the Stripe webhook endpoint that powers the AI credit
// grant flow. Run once per Stripe mode (test AND live have separate webhooks).
//
//   cd api
//   node scripts/setup-stripe-webhook.js                       # uses default URL
//   node scripts/setup-stripe-webhook.js https://api.you.app/api/stripe/webhook
//
// It reads STRIPE_SECRET_KEY from api/.env, so whichever mode that key is in
// (test vs live) is the mode the webhook is created in. On success it prints the
// signing secret — copy it into your backend env as STRIPE_WEBHOOK_SECRET and
// redeploy, or the handler will reject events with "Webhook secret missing".
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_URL = 'https://api.atelierlabs.app/api/stripe/webhook';
const url = process.argv[2] || DEFAULT_URL;

// The events the webhook handler in index.js acts on.
const EVENTS = ['invoice.paid', 'customer.subscription.deleted'];

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY is missing from api/.env');
  process.exit(1);
}
const mode = key.startsWith('sk_live') ? 'LIVE' : 'TEST';
const stripe = require('stripe')(key);

(async () => {
  console.log(`Stripe mode: ${mode}`);
  console.log(`Target URL:  ${url}`);
  try {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const dup = existing.data.find((e) => e.url === url);
    if (dup) {
      // Already there — make sure it has the events we need.
      const missing = EVENTS.filter((ev) => !dup.enabled_events.includes(ev) && !dup.enabled_events.includes('*'));
      if (missing.length) {
        const updated = await stripe.webhookEndpoints.update(dup.id, {
          enabled_events: Array.from(new Set([...dup.enabled_events, ...EVENTS])),
        });
        console.log(`Updated existing endpoint ${updated.id}; added: ${missing.join(', ')}`);
      } else {
        console.log(`Endpoint already exists with the right events: ${dup.id}`);
      }
      console.log('Signing secret: (reveal in Dashboard → Developers → Webhooks → this endpoint)');
      return;
    }

    const ep = await stripe.webhookEndpoints.create({
      url,
      enabled_events: EVENTS,
      description: 'Atelier — AI credit grants + subscription downgrade',
    });
    console.log('\n✅ Created webhook endpoint');
    console.log('  id:     ', ep.id);
    console.log('  events: ', ep.enabled_events.join(', '));
    console.log('\n  STRIPE_WEBHOOK_SECRET=' + ep.secret);
    console.log('\nSet that in your backend env (Railway) and redeploy.');
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
