// ─── Billing routes — Stripe integration ─────────────────────────────────────
const router = require('express').Router();
const { adminQuery } = require('@restaurantos/db');

function getStripe() {
  const Stripe = require('stripe');
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

function getBaseUrl() {
  return 'https://restaurantosapi-production-434f.up.railway.app';
}

// ── Plan config (reads from env, falls back to defaults) ──────────────────────
function getBasePlans() {
  return [
    {
      id:          'appetizer',
      name:        process.env.PLAN_NAME_APPETIZER || 'Appetizer',
      price_id:    process.env.STRIPE_PRICE_APPETIZER,
      description: 'Perfect for single-location restaurants',
      features:    ['Up to 2 locations','Business Health & KPIs','Inventory management','Basic loyalty (500 members)','Reviews dashboard','Marketing AI (50 posts/mo)'],
    },
    {
      id:          'entree',
      name:        process.env.PLAN_NAME_ENTREE || 'Entree',
      price_id:    process.env.STRIPE_PRICE_ENTREE,
      description: 'For growing multi-location groups',
      features:    ['Up to 5 locations','Everything in Appetizer','Cash flow & profitability with bank sync','Full loyalty program','Customer portal & QR card','SMS notifications','AI campaign copy'],
      popular:     true,
    },
    {
      id:          'buffet',
      name:        process.env.PLAN_NAME_BUFFET || 'Full Buffet',
      price_id:    process.env.STRIPE_PRICE_BUFFET,
      description: 'Unlimited scale for large groups',
      features:    ['Unlimited locations','Everything in Entree','Toast POS auto-sync','Mobile app included','Local visibility & SEO','White-label loyalty','Dedicated onboarding'],
    },
  ];
}

// Fetch live prices from Stripe and merge with plan config
async function getPlans() {
  const plans = getBasePlans();
  try {
    const stripe = getStripe();
    await Promise.all(plans.map(async plan => {
      if (!plan.price_id) return;
      const price = await stripe.prices.retrieve(plan.price_id);
      plan.amount        = price.unit_amount / 100;
      plan.currency      = price.currency.toUpperCase();
      plan.interval      = price.recurring?.interval || 'month';
    }));
  } catch(e) {
    console.error('[billing] failed to fetch Stripe prices:', e.message);
  }
  return plans;
}

// GET /api/billing/plans — public, no auth
router.get('/plans', async (req, res, next) => {
  try { res.json({ ok: true, data: await getPlans() }); } catch(e) { next(e); }
});

// POST /api/billing/checkout — create Stripe checkout session
router.post('/checkout', async (req, res, next) => {
  try {
    const { planId, tenantId, email } = req.body;
    const plans = await getPlans();
    const plan  = plans.find(p => p.id === planId);
    if (!plan?.price_id) return res.status(400).json({ ok: false, error: 'Invalid plan or price not configured' });

    const stripe   = getStripe();
    const baseUrl  = getBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      line_items:         [{ price: plan.price_id, quantity: 1 }],
      customer_email:     email,
      subscription_data: {
        trial_settings:    { end_behavior: { missing_payment_method: 'cancel' } },
        metadata:          { tenantId, planId },
        trial_period_days: 14,
      },
      success_url: `${baseUrl}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/onboarding/billing`,
    });

    res.json({ ok: true, data: { url: session.url, session_id: session.id } });
  } catch(e) { next(e); }
});

// GET /api/billing/status — get current subscription status
router.get('/status', async (req, res, next) => {
  try {
    const result = await adminQuery(
      'SELECT stripe_customer_id, stripe_subscription_id, plan, plan_name, trial_ends_at, subscription_status FROM tenants WHERE id=$1',
      [req.tenantId]
    );
    const tenant = result.rows[0];
    res.json({ ok: true, data: tenant || {} });
  } catch(e) { next(e); }
});

// POST /api/billing/portal — customer portal for managing subscription
router.post('/portal', async (req, res, next) => {
  try {
    const result = await adminQuery('SELECT stripe_customer_id FROM tenants WHERE id=$1', [req.tenantId]);
    const customerId = result.rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ ok: false, error: 'No billing account yet — please complete checkout first', code: 'NO_CUSTOMER' });

    const stripe  = getStripe();
    const baseUrl = getBaseUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${baseUrl}/settings`,
    });
    res.json({ ok: true, data: { url: session.url } });
  } catch(e) { next(e); }
});

module.exports = router;
module.exports.getPlans = getPlans;
module.exports.getBasePlans = getBasePlans;
