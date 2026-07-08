// ─── Auth routes ─────────────────────────────────────────────────────────────
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { adminQuery } = require('@restaurantos/db');
const { signToken }  = require('../middleware/auth');

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required', code: 400 });
    }

    const result = await adminQuery(
`SELECT u.*, t.name as tenant_name, t.active_agents,
              t.subscription_status, t.trial_ends_at, t.plan_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.active = true
       LIMIT 1`,
      [email.toLowerCase()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials', code: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials', code: 401 });
    }

    // Update last login
    await adminQuery(
      'UPDATE users SET last_login_at = now() WHERE id = $1',
      [user.id]
    );

    const token = signToken({
      userId:             user.id,
      tenantId:           user.tenant_id,
      email:              user.email,
      role:               user.role,
      locationIds:        user.location_ids || [],
      subscriptionStatus: user.subscription_status || 'trial',
      planName:           user.plan_name || 'appetizer',
      trialEndsAt:        user.trial_ends_at,
    });

    res.json({
      ok: true,
      data: {
        token,
        user: {
          id:           user.id,
          tenantId:     user.tenant_id,
          tenantName:   user.tenant_name,
          email:        user.email,
          name:         user.name,
          role:         user.role,
          locationIds:  user.location_ids,
          activeAgents:        user.active_agents,
          subscriptionStatus:  user.subscription_status || 'trial',
          planName:            user.plan_name || 'appetizer',
          trialEndsAt:         user.trial_ends_at,
        },
      },
    });
  } catch (err) { next(err); }
});

// POST /auth/register (creates tenant + owner user)
router.post('/register', async (req, res, next) => {
  try {
    const { tenantName, email, password, name } = req.body;
    if (!tenantName || !email || !password || !name) {
      return res.status(400).json({ ok: false, error: 'tenantName, email, password, name required', code: 400 });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters', code: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Create tenant + owner user in a transaction
    const tenantId = uuidv4();
    const userId   = uuidv4();
    const allAgents = ['agent_1_marketing','agent_2_financial','agent_3_inventory',
      'agent_4_reviews','agent_5_cashpl','agent_6_training','agent_7_seo','agent_8_loyalty','agent_9_labor','agent_10_training','agent_11_menu'];

    await adminQuery('BEGIN');
    try {
      await adminQuery(
        `INSERT INTO tenants (id, name, plan, active_agents)
         VALUES ($1, $2, 'starter', $3)`,
        [tenantId, tenantName, allAgents]
      );
      await adminQuery(
        `INSERT INTO users (id, tenant_id, email, name, password_hash, role, location_ids)
         VALUES ($1, $2, $3, $4, $5, 'owner', '{}')`,
        [userId, tenantId, email.toLowerCase(), name, passwordHash]
      );
      await adminQuery('COMMIT');
    } catch(e) {
      await adminQuery('ROLLBACK');
      if (e.constraint === 'users_tenant_email_unique') {
        return res.status(409).json({ ok: false, error: 'Email already registered', code: 409 });
      }
      throw e;
    }

    const token = signToken({
      userId,
      tenantId,
      email:       email.toLowerCase(),
      role:        'owner',
      locationIds: [],
    });

    res.status(201).json({
      ok: true,
      data: {
        token,
        user: { id: userId, tenantId, email, name, role: 'owner', locationIds: [], activeAgents: allAgents, subscriptionStatus: 'trial', planName: 'appetizer', trialEndsAt: null },
      },
    });
  } catch (err) { next(err); }
});


// POST /auth/google — verify Google ID token, find or create user
router.post('/google', async (req, res, next) => {
  try {
    const { credential, tenantName } = req.body;
    if (!credential) return res.status(400).json({ ok:false, error:'Google credential required' });

    // Verify the ID token with Google
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken:  credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch(e) {
      return res.status(401).json({ ok:false, error:'Invalid Google token' });
    }

    const { email, name, sub: googleId, picture } = payload;
    if (!email) return res.status(400).json({ ok:false, error:'No email in Google token' });

    // Add columns if not exist (migration)
    await adminQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100)').catch(()=>{});
    await adminQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)').catch(()=>{});
    await adminQuery("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email'").catch(()=>{});
    await adminQuery('CREATE UNIQUE INDEX IF NOT EXISTS users_google_id ON users(google_id) WHERE google_id IS NOT NULL').catch(()=>{});

    // Try to find existing user by email or google_id
    const existing = await adminQuery(
      `SELECT u.*, t.name as tenant_name, t.active_agents, t.subscription_status, t.trial_ends_at, t.plan_name
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE (u.email=$1 OR u.google_id=$2) AND u.active=true LIMIT 1`,
      [email.toLowerCase(), googleId]
    );

    let user = existing.rows[0];

    if (user) {
      // Update google_id and avatar if not set
      await adminQuery(
        'UPDATE users SET google_id=$1, avatar_url=$2, last_login_at=now() WHERE id=$3',
        [googleId, picture||null, user.id]
      );
    } else {
      // New user — need a tenant
      // If tenantName provided, create new tenant (registration flow)
      // Otherwise return error asking them to register first
      if (!tenantName) {
        return res.status(404).json({
          ok: false,
          error: 'No account found for this Google account. Please register first.',
          code: 'NO_ACCOUNT',
        });
      }

      // Create new tenant + user (registration via Google)
      const tenantId = uuidv4();
      const userId   = uuidv4();
      const allAgents = ['agent_1_marketing','agent_2_financial','agent_3_inventory',
        'agent_4_reviews','agent_5_cashpl','agent_6_training','agent_7_seo',
        'agent_8_loyalty','agent_9_labor','agent_10_training','agent_11_menu'];

      await adminQuery('BEGIN');
      try {
        await adminQuery(
          `INSERT INTO tenants (id, name, plan, active_agents) VALUES ($1,$2,'starter',$3)`,
          [tenantId, tenantName, allAgents]
        );
        await adminQuery(
          `INSERT INTO users (id,tenant_id,email,name,google_id,avatar_url,auth_provider,role,location_ids,password_hash)
           VALUES ($1,$2,$3,$4,$5,$6,'google','owner','{}','')`,
          [userId, tenantId, email.toLowerCase(), name||email.split('@')[0], googleId, picture||null]
        );
        await adminQuery('COMMIT');
      } catch(e) {
        await adminQuery('ROLLBACK');
        throw e;
      }

      // Fetch the newly created user
      const newUser = await adminQuery(
        `SELECT u.*, t.name as tenant_name, t.active_agents, t.subscription_status, t.trial_ends_at, t.plan_name
         FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1`,
        [userId]
      );
      user = newUser.rows[0];
    }

    const token = signToken({
      userId:             user.id,
      tenantId:           user.tenant_id,
      email:              user.email,
      role:               user.role,
      locationIds:        user.location_ids || [],
      subscriptionStatus: user.subscription_status || 'trial',
      planName:           user.plan_name || 'appetizer',
      trialEndsAt:        user.trial_ends_at,
    });

    res.json({
      ok: true,
      data: {
        token,
        user: {
          id:                 user.id,
          tenantId:           user.tenant_id,
          tenantName:         user.tenant_name,
          email:              user.email,
          name:               user.name,
          role:               user.role,
          avatarUrl:          user.avatar_url,
          locationIds:        user.location_ids,
          activeAgents:       user.active_agents,
          subscriptionStatus: user.subscription_status || 'trial',
          planName:           user.plan_name || 'appetizer',
          trialEndsAt:        user.trial_ends_at,
        },
      },
    });
  } catch(err) { next(err); }
});

// POST /auth/refresh  — re-fetch user from DB and issue fresh token (picks up role/permission changes)
router.post('/refresh', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, error: 'Token required', code: 400 });
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-CHANGE-IN-PRODUCTION');

    // Re-fetch user + tenant from DB so we get latest roles, active_agents, subscription status
    const result = await adminQuery(
      `SELECT u.*, t.name as tenant_name, t.active_agents, t.subscription_status, t.trial_ends_at, t.plan_name
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.active = true LIMIT 1`,
      [payload.userId]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ ok: false, error: 'User not found', code: 401 });

    const newToken = signToken({
      userId: user.id, tenantId: user.tenant_id, email: user.email,
      role: user.role, locationIds: user.location_ids || [],
      subscriptionStatus: user.subscription_status || 'trial',
      planName: user.plan_name || 'appetizer', trialEndsAt: user.trial_ends_at,
    });
    res.json({ ok: true, data: { token: newToken } });
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid or expired token', code: 401 });
  }
});

module.exports = router;
