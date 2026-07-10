// One-time setup: creates the Basic ($29/mo) and Premium ($79/mo) Stripe
// Products + Prices from your own secret key, then writes the resulting
// Price IDs straight into api/.env. Safe to re-run — it skips creating
// anything that's already there (checked by product name).
//
// Usage: add STRIPE_SECRET_KEY to api/.env, then from the api/ folder run:
//   node scripts/setup-stripe-products.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('❌ STRIPE_SECRET_KEY is not set in api/.env — add it first.');
  process.exit(1);
}

const stripe = require('stripe')(key);
const ENV_PATH = path.join(__dirname, '..', '.env');

const TIERS = [
  { name: 'Grainline Basic', envKey: 'STRIPE_PRICE_BASIC', unitAmount: 2900 },
  { name: 'Grainline Premium', envKey: 'STRIPE_PRICE_PREMIUM', unitAmount: 7900 },
];

async function ensureProductAndPrice({ name, unitAmount }) {
  const existing = await stripe.products.search({ query: `name:'${name}' AND active:'true'` });
  let product = existing.data[0];
  if (!product) {
    product = await stripe.products.create({ name });
    console.log(`Created product: ${name}`);
  } else {
    console.log(`Found existing product: ${name}`);
  }

  const prices = await stripe.prices.list({ product: product.id, active: true });
  let price = prices.data.find(p => p.unit_amount === unitAmount && p.recurring?.interval === 'month');
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: unitAmount,
      currency: 'usd',
      recurring: { interval: 'month' },
    });
    console.log(`Created price for ${name}: ${price.id}`);
  } else {
    console.log(`Found existing price for ${name}: ${price.id}`);
  }
  return price.id;
}

async function main() {
  const results = {};
  for (const tier of TIERS) {
    results[tier.envKey] = await ensureProductAndPrice(tier);
  }

  let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  for (const [key, value] of Object.entries(results)) {
    const line = `${key}=${value}`;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) envContent = envContent.replace(regex, line);
    else envContent += (envContent.endsWith('\n') || envContent === '' ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(ENV_PATH, envContent);

  console.log('\n✅ Done. Added to api/.env:');
  Object.entries(results).forEach(([k, v]) => console.log(`   ${k}=${v}`));
  console.log('\nRestart the backend (node index.js) to pick these up.');
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
