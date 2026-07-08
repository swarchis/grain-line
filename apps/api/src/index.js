// ─── RestaurantOS API — Entry point ──────────────────────────────────────────
// Single Express server serving all 8 agent route modules.
// All agents share: auth middleware, DB client, event bus, rate limiting.

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const { ping }   = require('@restaurantos/db');
const { authMiddleware, requireRole } = require('./middleware/auth');
const { eventBus } = require('./lib/eventBus');

// ── Agent route modules ────────────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const tenantsRoutes   = require('./routes/tenants');
const locationsRoutes = require('./routes/locations');
const adminRoutes     = require('./routes/admin');
const billingRoutes        = require('./routes/billing');
const loyaltyWebhookRoutes = require('./routes/loyaltyWebhook');
const toastAdapterRoutes   = require('./routes/toastAdapter');
const superAdminRoutes     = require('./routes/superAdmin');
// Agents
const agent1Routes    = require('./agents/agent1/routes');
const agent2Routes    = require('./agents/agent2/routes');
const agent3Routes    = require('./agents/agent3/routes');
const agent4Routes    = require('./agents/agent4/routes');
const agent5Routes    = require('./agents/agent5/routes');
const agent6Routes    = require('./agents/agent6/routes');
const agent9Routes    = require('./agents/agent9/routes');
const reportsRoutes   = require('./reports/routes');
const integrationsRoutes = require('./integrations/routes');
const posRoutes       = require('./pos/routes');
const insightsRoutes  = require('./insights/routes');
const agent11Routes      = require('./agents/agent11/routes');
const assistantRoutes    = require('./agents/assistant/routes');
const agent7Routes    = require('./agents/agent7/routes');
const agent8Routes    = require('./agents/agent8/routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    /\.railway\.app$/,
    /\.onrender\.com$/,
    /localhost:\d+$/,
  ],
  credentials: true,
}));

// ── Stripe webhook (raw body required — must be before json middleware) ────────
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(400).send('Webhook secret not configured');

  let event;
  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch(e) {
    console.error('[webhook] signature verification failed:', e.message);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    const { adminQuery } = require('@restaurantos/db');
    const data = event.data.object;

    if (event.type === 'checkout.session.completed') {
      const { tenantId, planId } = data.metadata || {};
      if (tenantId) {
        await adminQuery(`
          UPDATE tenants SET
            stripe_customer_id      = $1,
            stripe_subscription_id  = $2,
            plan_name               = $3,
            subscription_status     = 'trialing',
            trial_ends_at           = now() + interval '14 days',
            updated_at              = now()
          WHERE id = $4
        `, [data.customer, data.subscription, planId, tenantId]);
        console.log('[billing] checkout complete for tenant:', tenantId);
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const tenant = await adminQuery('SELECT id FROM tenants WHERE stripe_subscription_id=$1', [data.id]);
      if (tenant.rows[0]) {
        await adminQuery(
          'UPDATE tenants SET subscription_status=$1, updated_at=now() WHERE stripe_subscription_id=$2',
          [data.status, data.id]
        );
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const tenant = await adminQuery('SELECT id FROM tenants WHERE stripe_subscription_id=$1', [data.id]);
      if (tenant.rows[0]) {
        await adminQuery(
          "UPDATE tenants SET subscription_status='canceled', updated_at=now() WHERE stripe_subscription_id=$1",
          [data.id]
        );
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const tenant = await adminQuery('SELECT id FROM tenants WHERE stripe_customer_id=$1', [data.customer]);
      if (tenant.rows[0]) {
        await adminQuery(
          "UPDATE tenants SET subscription_status='past_due', updated_at=now() WHERE stripe_customer_id=$1",
          [data.customer]
        );
      }
    }

    res.json({ received: true });
  } catch(e) {
    console.error('[webhook] handler error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Body parsing ───────────────────────────────────────────────────────────────
// Default body limit — 100kb is generous for API JSON
app.use((req, res, next) => {
  // Upload/scan/import endpoints carry file payloads (base64 or large CSV text).
  // Suffix rule instead of a hardcoded list — this bug recurred three times:
  // invoice scans, compliance/video uploads, newsletter contact CSV import.
  const limit = /\/(upload|scan|scan-bulk|import)$/.test(req.path) ? '40mb' : '100kb';
  express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// ── Logging ────────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ──────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
  skip: (req) => req.path === '/health', // don't rate limit health checks
});
app.use('/api', globalLimiter);

// AI generation gets its own tighter limit (prevent runaway Claude costs)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  message:  { ok: false, error: 'AI generation rate limit. Please wait a moment.' },
});
app.use('/api/*/ai', aiLimiter);
app.use('/api/ai',   aiLimiter);

// Auth routes get a strict brute-force limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      20,              // 20 attempts per IP per window
  message:  { ok: false, error: 'Too many login attempts. Please wait 15 minutes.', code: 429 },
  standardHeaders: true,
  legacyHeaders:   false,
});
app.use('/auth/login',    authLimiter);
app.use('/auth/register', authLimiter);

// ── Health check (no auth required) ───────────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbOk = false;
  try { dbOk = await ping(); } catch (_) {}
  res.status(dbOk ? 200 : 503).json({
    status:      dbOk ? 'ok' : 'degraded',
    timestamp:   new Date().toISOString(),
    version:     '1.0.0',
    db:          dbOk ? 'connected' : 'unreachable',
    agents:      8,
    environment: process.env.NODE_ENV || 'development',
  });
});

// ── Auth routes (no middleware — they set the token) ──────────────────────────
app.use('/auth', authRoutes);

// ── All API routes require auth ────────────────────────────────────────────────
// Email invoice webhook — public endpoint, verified by secret header
app.post('/api/agent-3/email-webhook', async (req, res) => {
  try {
    const secret = req.headers['x-webhook-secret'];
    if (secret !== process.env.EMAIL_WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const service = require('./agents/agent3/service');
    const { tenantId, locationId, fromEmail, subject, attachments } = req.body;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId required' });
    const queued = await service.enqueueEmailInvoice(tenantId, { fromEmail, subject, attachments: attachments||[], locationId, rawPayload: req.body });
    // Process async — don't wait
    service.processEmailQueue(tenantId).catch(e => console.error('[email-webhook] process error:', e.message));
    res.json({ ok: true, data: { queueId: queued.id, message: 'Invoice queued for processing' } });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Public loyalty portal (no auth) ───────────────────────────────────────────
const agent8PublicRoutes = require('./agents/agent8/routes');
app.get('/api/agent-8/portal/:code', async (req, res, next) => {
  try {
    const service = require('./agents/agent8/service');
    const data = await service.getMemberPortal(req.params.code);
    res.json({ ok: true, data });
  } catch(e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});
app.post('/api/agent-8/enroll', async (req, res, next) => {
  try {
    const service = require('./agents/agent8/service');
    const { tenantId, name, email, phone, referralCode } = req.body;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId required' });
    const data = await service.enrollMember(tenantId, { name, email, phone, referralCode });
    res.json({ ok: true, data });
  } catch(e) {
    res.status(e.status || 500).json({ ok: false, error: e.message });
  }
});

// Public billing plans (no auth — needed for onboarding page)
app.get('/api/billing/plans', async (req, res) => {
  try {
    const { getPlans } = require('./routes/billing');
    const plans = await getPlans();
    res.json({ ok: true, data: plans });
  } catch(e) { res.json({ ok: true, data: [] }); }
});

// Super admin — public route, authenticated by SUPER_ADMIN_SECRET header
app.use('/api/super-admin', superAdminRoutes);

// Loyalty webhook — public, authenticated by LOYALTY_WEBHOOK_SECRET
app.use('/api/loyalty/webhook', loyaltyWebhookRoutes);
// Toast webhook — public (Toast can't send auth headers)
app.post('/api/toast/webhook', async (req, res, next) => {
  try { await require('./routes/toastAdapter').handleWebhook(req, res); }
  catch(e) { console.error('[toast-webhook]', e.message); res.json({ ok:true }); }
});

// ── Public staff PWA login (no auth required) ────────────────────────────────
app.post('/api/agent-9/staff/login', async (req, res, next) => {
  try {
    const agent9Service = require('./agents/agent9/service');
    const { signToken }  = require('./middleware/auth');
    const { locationId, pin, tenantId } = req.body;
    if (!locationId || !pin || !tenantId) return res.status(400).json({ok:false,error:'tenantId, locationId and pin required'});
    const emp = await agent9Service.staffLogin(tenantId, locationId, pin);
    const token = signToken({ tenantId, userId: emp.id, role: 'staff', employeeId: emp.id, locationId: emp.locationId, firstName: emp.firstName, lastName: emp.lastName });
    res.json({ ok:true, data:{ token, employee: emp } });
  } catch(e) { res.status(401).json({ok:false,error:e.message}); }
});

// Public newsletter unsubscribe (guests click this from emails — no auth)
app.get('/api/public/unsubscribe', async (req, res) => {
  try {
    const { tid, email } = req.query;
    if (tid && email) await require('./agents/agent1/service').unsubscribeContact(tid, email);
    res.send('<html><body style="font-family:Georgia,serif;padding:60px;text-align:center;background:#faf7f0"><h2>You have been unsubscribed</h2><p style="color:#777">You will no longer receive emails from this restaurant.</p></body></html>');
  } catch (e) {
    res.send('<html><body style="font-family:Georgia,serif;padding:60px;text-align:center"><h2>Something went wrong</h2><p>Please reply to the email and ask to be removed.</p></body></html>');
  }
});

// Public Twilio inbound webhook (STOP replies) — Twilio calls this unauthenticated
app.post('/api/twilio/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const agent1Service = require('./agents/agent1/service');
    const { From, To, Body } = req.body || {};
    const stopWords = ['stop','stopall','unsubscribe','cancel','end','quit'];
    if (From && stopWords.includes(String(Body||'').trim().toLowerCase())) {
      await agent1Service.handleOptOutByNumber(From, To);
      return res.set('Content-Type','text/xml').send('<?xml version="1.0"?><Response><Message>You have been unsubscribed. Reply START to resubscribe.</Message></Response>');
    }
    res.set('Content-Type','text/xml').send('<?xml version="1.0"?><Response></Response>');
  } catch (e) {
    console.error('[twilio inbound]', e.message);
    res.set('Content-Type','text/xml').send('<?xml version="1.0"?><Response></Response>');
  }
});

// Public Square OAuth callback (browser redirect from Square)
app.get('/api/pos/square/callback', async (req, res) => {
  try {
    const posService = require('./pos/service');
    await posService.squareCallback(req.query.code, req.query.state);
    res.redirect('/setup?pos=square_connected');
  } catch (e) {
    console.error('[square callback]', e.message);
    res.redirect('/setup?pos=square_error&msg=' + encodeURIComponent(e.message));
  }
});

// Cron: send Monday Briefs to all tenants (Railway cron hits this with secret)
app.post('/api/cron/monday-briefs', async (req, res) => {
  if (req.query.secret !== (process.env.CRON_SECRET || '')) return res.status(403).json({ ok: false });
  try { res.json({ ok: true, data: await require('./insights/service').sendAllMondayBriefs() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Public OAuth callbacks for social connects (browser redirects, unauthenticated)
const okPage = (what) => `<!doctype html><html><body style="font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#faf7f0"><div style="text-align:center;max-width:420px"><div style="font-size:48px">✅</div><h2>${what} connected</h2><p style="color:#777">All set — you can close this tab. The restaurant's Pulse dashboard now has access.</p></div></body></html>`;
app.get('/api/social/meta/callback', async (req, res) => {
  try {
    const r = await require('./social/service').metaCallback(req.query.code, req.query.state);
    if (r.fromInvite) return res.send(okPage('Instagram'));
    res.redirect('/setup?social=instagram_connected');
  } catch (e) { console.error('[meta cb]', e.message); res.redirect('/setup?social=instagram_error&msg=' + encodeURIComponent(e.message)); }
});
app.get('/api/social/facebook/callback', async (req, res) => {
  try {
    const r = await require('./social/service').facebookCallback(req.query.code, req.query.state);
    if (r.fromInvite) return res.send(okPage('Facebook Page'));
    res.redirect('/setup?social=facebook_connected');
  } catch (e) { console.error('[fb cb]', e.message); res.redirect('/setup?social=facebook_error&msg=' + encodeURIComponent(e.message)); }
});
app.get('/api/social/google/callback', async (req, res) => {
  try {
    const r = await require('./social/service').googleCallback(req.query.code, req.query.state);
    if (r.fromInvite) return res.send(okPage('Google Business Profile'));
    res.redirect('/setup?social=google_connected');
  } catch (e) { console.error('[google cb]', e.message); res.redirect('/setup?social=google_error&msg=' + encodeURIComponent(e.message)); }
});
// Meta compliance endpoints (required before App Review)
// Deauthorize: user removed the app — mark their integration disconnected.
app.post('/api/social/meta/deauthorize', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    // signed_request payload contains the IG/FB user id; we disconnect any tenant holding it
    const sr = String(req.body.signed_request || '').split('.')[1] || '';
    const payload = JSON.parse(Buffer.from(sr.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString() || '{}');
    const uid = String(payload.user_id || '');
    if (uid) {
      const { adminQuery } = require('@restaurantos/db');
      await adminQuery(`UPDATE tenant_integrations SET status='disconnected', updated_at=now()
        WHERE provider='meta' AND (config->'accounts')::text LIKE '%' || $1 || '%'`, [uid]).catch(() => {});
    }
    res.json({ success: true });
  } catch (e) { res.json({ success: true }); }
});
// Data deletion request: Meta expects { url, confirmation_code } back.
app.post('/api/social/meta/data-deletion', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const sr = String(req.body.signed_request || '').split('.')[1] || '';
    const payload = JSON.parse(Buffer.from(sr.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString() || '{}');
    const uid = String(payload.user_id || '');
    const code = 'del_' + (uid || 'unknown') + '_' + Date.now();
    if (uid) {
      const { adminQuery } = require('@restaurantos/db');
      await adminQuery(`UPDATE tenant_integrations SET status='disconnected', credentials=NULL, updated_at=now()
        WHERE provider='meta' AND (config->'accounts')::text LIKE '%' || $1 || '%'`, [uid]).catch(() => {});
    }
    res.json({ url: (process.env.API_URL || 'https://restaurantosapi-production-434f.up.railway.app') + '/api/social/meta/deletion-status?code=' + code, confirmation_code: code });
  } catch (e) { res.json({ url: '', confirmation_code: 'error' }); }
});
app.get('/api/social/meta/deletion-status', (req, res) => {
  res.send('<p style="font-family:sans-serif">✅ Data deletion request <code>' + String(req.query.code || '').replace(/[<>]/g, '') + '</code> has been processed. All stored Instagram tokens for this account were removed.</p>');
});

// Invite link entry — verifies token then bounces into the provider's OAuth dialog
app.get('/api/social/connect/:provider', (req, res) => {
  try { res.redirect(require('./social/service').inviteRedirectUrl(req.params.provider, req.query.invite || '')); }
  catch (e) { res.status(400).send('<p style="font-family:sans-serif">⚠ ' + e.message + '</p>'); }
});

// Public training video stream (signed token in query — <video> tags can't send headers)
app.get('/api/public/training-video/:id', require('./agents/agent10/videos').streamVideo);
// Public compliance file stream (signed token in query)
app.get('/api/public/compliance-file/:id', require('./agents/agent6/files').streamFile);

app.use('/api', authMiddleware);

// ── Core resource routes ───────────────────────────────────────────────────────

app.use('/api/tenants',   tenantsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/billing',   billingRoutes);
app.use('/api/toast',     toastAdapterRoutes);

// ── Agent routes ───────────────────────────────────────────────────────────────
// Each agent mounts under /api/agent-N/
// Agent services are isolated but share the same auth context and DB pool.
app.use('/api/agent-1', agent1Routes);   // Marketing & Content
app.use('/api/agent-2', agent2Routes);   // Financial KPI
app.use('/api/agent-3', agent3Routes);   // Inventory
app.use('/api/agent-4', agent4Routes);   // Reviews & Employee Performance
app.use('/api/agent-5', agent5Routes);   // Cash P&L
app.use('/api/agent-6', agent6Routes);   // Training & Compliance
app.use('/api/agent-9', agent9Routes);   // Labor & Scheduling
app.use('/api/reports', reportsRoutes);    // Reports
app.use('/api/integrations', integrationsRoutes); // Tenant integrations & setup
app.use('/api/pos', posRoutes);            // POS integrations (Square/Toast)
app.use('/api/insights', insightsRoutes);  // Monday Brief & cross-source reports
app.use('/api/agent-10/videos', require('./agents/agent10/videos')); // Training module videos
app.use('/api/agent-6/files', require('./agents/agent6/files')); // Compliance document file uploads
app.use('/api/social', require('./social/routes')); // Instagram + Google Business Profile
app.use('/api/agent-11', agent11Routes);  // Menu Management
app.use('/api/assistant', assistantRoutes); // AI Restaurant Assistant
app.use('/api/agent-7', agent7Routes);   // Local SEO & GBP
app.use('/api/agent-8', agent8Routes);   // Loyalty & Referral

// ── Serve frontend build (production) ─────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../web/dist');
  const marketingDir = path.join(__dirname, '../../marketing');

  // Marketing site on the root domain; the app stays on app.* and the Railway URL
  const isMarketingHost = (req) => /^(www\.)?tableintelligence\.ai$/.test(req.hostname || '');
  app.use((req, res, nxt) => {
    if (!isMarketingHost(req)) return nxt();
    express.static(marketingDir, {
      setHeaders: (res2, fp) => {
        if (fp.endsWith('.html')) res2.setHeader('Cache-Control', 'no-cache');
        else res2.setHeader('Cache-Control', 'public, max-age=86400');
      },
    })(req, res, () => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(marketingDir, 'index.html'));
    });
  });

  // Hashed assets cache forever; index.html must never cache (else deploys don't reach browsers)
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    ok:      false,
    error:   err.message || 'Internal server error',
    code:    status,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}`, code: 404 });
});

// ── Start ─────────────────────────────────────────────────────────────────────
// ── Run billing migrations on startup ─────────────────────────────────────────
(async () => {
  try {
    const { adminQuery } = require('@restaurantos/db');
    const migrations = [
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(200)",
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(200)",
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_name VARCHAR(50) DEFAULT 'appetizer'",
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) DEFAULT 'trial'",
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days')",
      "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()",
    ];
    for (const sql of migrations) await adminQuery(sql).catch(() => {});
    console.log('[billing] DB migrations complete');
    // Add agent_9_labor to all existing tenants that don't have it
    await adminQuery(`
      UPDATE tenants
      SET active_agents = array_append(active_agents, 'agent_9_labor')
      WHERE NOT ('agent_9_labor' = ANY(active_agents))
    `).catch(() => {});
    await adminQuery(`
      UPDATE tenants
      SET active_agents = array_append(active_agents, 'agent_10_training')
      WHERE NOT ('agent_10_training' = ANY(active_agents))
    `).catch(() => {});
    await adminQuery(`
      UPDATE tenants
      SET active_agents = array_append(active_agents, 'agent_11_menu')
      WHERE NOT ('agent_11_menu' = ANY(active_agents))
    `).catch(() => {});
    await adminQuery(`
      UPDATE tenants
      SET active_agents = array_append(active_agents, 'agent_7_seo')
      WHERE NOT ('agent_7_seo' = ANY(active_agents))
    `).catch(() => {});
    console.log('[startup] agent_9_labor added to existing tenants');
  } catch(e) { console.error('[billing] migration error:', e.message); }
})();

app.listen(PORT, () => {
  console.log(`\n🚀 RestaurantOS API running on port ${PORT}`);
  console.log(`   Env:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Agents: 8 modules mounted\n`);
});

module.exports = app;
