// ─── Agent 6: Gamification & Learning ────────────────────────────────────────
const { adminQuery } = require('@restaurantos/db');
const { callClaude, parseJSON } = require('../../lib/claude');
const { once } = require('../../lib/tableCache');

// ── Point values ──────────────────────────────────────────────────────────────
const POINT_RULES = {
  training_complete:   50,
  training_passed:    100,
  upsell:              10,   // per item upselled (tracked via POS)
  challenge_complete: 200,
  attendance:          20,   // per shift on time
  review_mention:      50,   // positive review mention
  waste_reduction:     30,
  peer_recognition:    25,
  streak_7day:        150,
  streak_30day:       500,
};

// ── Levels ────────────────────────────────────────────────────────────────────
const LEVELS = [
  { key:'rookie',   label:'Rookie',   minPts:0,    color:'#8090A0', icon:'🌱' },
  { key:'pro',      label:'Pro',      minPts:500,  color:'#4A90D9', icon:'⭐' },
  { key:'expert',   label:'Expert',   minPts:1500, color:'#9B59B6', icon:'💎' },
  { key:'elite',    label:'Elite',    minPts:3500, color:'#E8A020', icon:'🏆' },
  { key:'legend',   label:'Legend',   minPts:7500, color:'#E24B4A', icon:'👑' },
];

const BADGE_DEFS = [
  { key:'first_lesson',      label:'First Lesson',        icon:'📚', desc:'Completed your first training module' },
  { key:'speed_learner',     label:'Speed Learner',        icon:'⚡', desc:'Completed 5 modules in one week' },
  { key:'perfect_score',     label:'Perfect Score',        icon:'💯', desc:'100% on a training quiz' },
  { key:'upsell_star',       label:'Upsell Star',          icon:'🌟', desc:'Upsold 50 items' },
  { key:'top_apc',           label:'Top APC',              icon:'💰', desc:'Highest APC on shift' },
  { key:'challenge_winner',  label:'Challenge Winner',     icon:'🥇', desc:'Won a team challenge' },
  { key:'streak_7',          label:'7-Day Streak',         icon:'🔥', desc:'7 consecutive shifts attended' },
  { key:'streak_30',         label:'30-Day Streak',        icon:'🚀', desc:'30 consecutive shifts attended' },
  { key:'review_hero',       label:'Review Hero',          icon:'⭐', desc:'Mentioned in 5 positive reviews' },
  { key:'waste_warrior',     label:'Waste Warrior',        icon:'♻️', desc:'Contributed to waste reduction' },
  { key:'team_captain',      label:'Team Captain',         icon:'🤝', desc:'Helped 10 teammates' },
];

const LEARNING_CATEGORIES = [
  { key:'food',       label:'Food & Recipes',       icon:'🍽️' },
  { key:'beverage',   label:'Beverage & Cocktails',  icon:'🍸' },
  { key:'service',    label:'Service Standards',     icon:'🤝' },
  { key:'upselling',  label:'Upselling & Sales',     icon:'💰' },
  { key:'safety',     label:'Safety & Compliance',   icon:'🛡️' },
  { key:'onboarding', label:'Onboarding',            icon:'🚀' },
];

// ── Ensure tables ──────────────────────────────────────────────────────────────
const ensureGamificationTables = once('agent6-gam', async function() {
  // Extend training_modules with new columns
  const moduleMigrations = [
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS location_id UUID",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'onboarding'",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS content TEXT",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS video_url TEXT",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS thumbnail_url TEXT",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 5",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS points_reward INTEGER DEFAULT 50",
    "ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()",
    "ALTER TABLE training_modules ALTER COLUMN mandatory DROP NOT NULL",
    "ALTER TABLE training_modules ALTER COLUMN pass_score DROP NOT NULL",
    "ALTER TABLE training_modules ALTER COLUMN validity_days DROP NOT NULL",
    "ALTER TABLE training_modules ALTER COLUMN required_roles DROP NOT NULL",
  ];

  const completionMigrations = [
    "ALTER TABLE training_completions ADD COLUMN IF NOT EXISTS tenant_id UUID",
    "ALTER TABLE training_completions ADD COLUMN IF NOT EXISTS employee_name VARCHAR(200)",
    "ALTER TABLE training_completions ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0",
    "ALTER TABLE training_completions ALTER COLUMN score DROP NOT NULL",
    "ALTER TABLE training_completions ALTER COLUMN passed DROP NOT NULL",
    "ALTER TABLE training_completions ALTER COLUMN completed_at DROP NOT NULL",
    "ALTER TABLE training_completions ALTER COLUMN expires_at DROP NOT NULL",
  ];

  for (const sql of [...moduleMigrations, ...completionMigrations]) await adminQuery(sql).catch(()=>{});

  const stmts = [`
    CREATE TABLE IF NOT EXISTS gamification_points (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      employee_id   UUID NOT NULL,
      employee_name VARCHAR(200),
      location_id   UUID,
      point_type    VARCHAR(50) NOT NULL,
      points        INTEGER NOT NULL,
      reference_id  UUID,
      reference_type VARCHAR(50),
      note          TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS gamification_challenges (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id       UUID NOT NULL,
      location_id     UUID,
      title           VARCHAR(300) NOT NULL,
      description     TEXT,
      challenge_type  VARCHAR(50) NOT NULL DEFAULT 'individual',
      metric          VARCHAR(50) NOT NULL,
      target          NUMERIC(10,2) NOT NULL,
      points_reward   INTEGER NOT NULL DEFAULT 200,
      bonus_reward    TEXT,
      start_date      DATE NOT NULL,
      end_date        DATE NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'active',
      created_by      UUID,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS gamification_challenge_entries (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id    UUID NOT NULL,
      challenge_id UUID NOT NULL REFERENCES gamification_challenges(id) ON DELETE CASCADE,
      employee_id  UUID NOT NULL,
      employee_name VARCHAR(200),
      progress     NUMERIC(10,2) NOT NULL DEFAULT 0,
      completed    BOOLEAN NOT NULL DEFAULT false,
      completed_at TIMESTAMPTZ,
      rank         INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(challenge_id, employee_id)
    )`,`
    CREATE TABLE IF NOT EXISTS gamification_rewards (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      title         VARCHAR(200) NOT NULL,
      description   TEXT,
      reward_type   VARCHAR(30) NOT NULL,
      value         NUMERIC(10,2),
      points_cost   INTEGER NOT NULL,
      active        BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS gamification_reward_claims (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id     UUID NOT NULL,
      reward_id     UUID NOT NULL REFERENCES gamification_rewards(id) ON DELETE CASCADE,
      employee_id   UUID NOT NULL,
      employee_name VARCHAR(200),
      points_spent  INTEGER NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      manager_notes TEXT,
      reviewed_by   UUID,
      reviewed_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,`
    CREATE TABLE IF NOT EXISTS employee_gamification (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id         UUID NOT NULL,
      employee_id       UUID NOT NULL,
      employee_name     VARCHAR(200),
      location_id       UUID,
      total_points      INTEGER NOT NULL DEFAULT 0,
      available_points  INTEGER NOT NULL DEFAULT 0,
      level             VARCHAR(20) NOT NULL DEFAULT 'rookie',
      streak_days       INTEGER NOT NULL DEFAULT 0,
      last_activity     DATE,
      badges            TEXT[] NOT NULL DEFAULT '{}',
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, employee_id)
    )`,
  ];
  for (const sql of stmts) await adminQuery(sql).catch(e=>console.error('[agent6-gamification] table error:', e.message));

  const indexes = [
    'CREATE INDEX IF NOT EXISTS gp_employee ON gamification_points(employee_id)',
    'CREATE INDEX IF NOT EXISTS gp_tenant   ON gamification_points(tenant_id)',
    'CREATE INDEX IF NOT EXISTS eg_tenant   ON employee_gamification(tenant_id)',
    'CREATE INDEX IF NOT EXISTS eg_location ON employee_gamification(location_id)',
  ];
  for (const sql of indexes) await adminQuery(sql).catch(()=>{});
});

// ── Learning modules ──────────────────────────────────────────────────────────
async function getModules(tenantId, { locationId, category, active = true } = {}) {
  await ensureGamificationTables();
  let where = 'tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ` AND (location_id=$${i++} OR location_id IS NULL)`; params.push(locationId); }
  if (category)   { where += ` AND category=$${i++}`; params.push(category); }
  if (active)     { where += ` AND COALESCE(active, true) = true`; }
  const r = await adminQuery(
    `SELECT * FROM training_modules WHERE ${where} ORDER BY category, title`,
    params
  );
  return r.rows;
}

async function upsertModule(tenantId, data) {
  await ensureGamificationTables();
  const { id, locationId, title, description, category, content, contentType,
          videoUrl, thumbnailUrl, estimatedMinutes, pointsReward, requiredRoles,
          validityDays, passScore, mandatory, active } = data;
  if (id) {
    const r = await adminQuery(`
      UPDATE training_modules SET
        title=$1, description=$2, category=$3, content=$4, content_type=$5,
        video_url=$6, thumbnail_url=$7, estimated_minutes=$8, points_reward=$9,
        required_roles=$10, validity_days=$11, mandatory=$12, active=$13, updated_at=now()
      WHERE id=$14 AND tenant_id=$15 RETURNING *
    `, [title, description||null, category||'onboarding', content||null, contentType||'text',
        videoUrl||null, thumbnailUrl||null, estimatedMinutes||5, pointsReward||50,
        requiredRoles||'{}', validityDays||365, mandatory??false, active??true, id, tenantId]);
    return r.rows[0];
  }
  const r = await adminQuery(`
    INSERT INTO training_modules
      (tenant_id, location_id, title, description, category, content, content_type,
       video_url, thumbnail_url, estimated_minutes, points_reward, required_roles,
       validity_days, pass_score, mandatory, active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *
  `, [tenantId, locationId||null, title, description||null, category||'onboarding',
      content||null, contentType||'text', videoUrl||null, thumbnailUrl||null,
      estimatedMinutes||5, pointsReward||50, requiredRoles||'{}',
      validityDays||365, passScore||0, mandatory??false, active??true]);
  return r.rows[0];
}

async function deleteModule(tenantId, moduleId) {
  await adminQuery("UPDATE training_modules SET active=false, updated_at=now() WHERE id=$1 AND tenant_id=$2", [moduleId, tenantId]);
  return { ok:true };
}

async function completeModule(tenantId, moduleId, { employeeId, employeeName, score }) {
  await ensureGamificationTables();
  const mod = await adminQuery('SELECT * FROM training_modules WHERE id=$1', [moduleId]);
  if (!mod.rows[0]) throw Object.assign(new Error('Module not found'), {status:404});
  const m = mod.rows[0];
  const passed = !m.pass_score || score >= m.pass_score;
  const pts    = passed ? (m.points_reward || POINT_RULES.training_passed) : POINT_RULES.training_complete;

  await adminQuery(`
    INSERT INTO training_completions (employee_id, module_id, tenant_id, employee_name, score, passed, points_awarded, completed_at, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now(), now() + interval '1 year')
    ON CONFLICT (employee_id, module_id) DO UPDATE
    SET score=$5, passed=$6, points_awarded=$7, completed_at=now()
  `, [employeeId, moduleId, tenantId, employeeName||null, score||100, passed, pts]);

  await awardPoints(tenantId, employeeId, employeeName, 'training_complete', pts, moduleId, 'training_module');
  if (passed && score === 100) await awardBadge(tenantId, employeeId, 'perfect_score');

  // Check first lesson badge
  const count = await adminQuery('SELECT COUNT(*) FROM training_completions WHERE employee_id=$1 AND tenant_id=$2', [employeeId, tenantId]);
  if (parseInt(count.rows[0].count) === 1) await awardBadge(tenantId, employeeId, 'first_lesson');

  return { ok:true, passed, points_awarded: pts };
}

async function getCompletions(tenantId, { employeeId, moduleId, locationId } = {}) {
  let where = 'tc.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (employeeId) { where += ` AND tc.employee_id=$${i++}`; params.push(employeeId); }
  if (moduleId)   { where += ` AND tc.module_id=$${i++}`; params.push(moduleId); }
  const r = await adminQuery(`
    SELECT tc.*, tm.title, tm.category, tm.points_reward
    FROM training_completions tc
    JOIN training_modules tm ON tm.id = tc.module_id
    WHERE ${where} ORDER BY tc.completed_at DESC
  `, params);
  return r.rows;
}

// ── Points & levels ───────────────────────────────────────────────────────────
async function awardPoints(tenantId, employeeId, employeeName, pointType, points, referenceId, referenceType) {
  await adminQuery(`
    INSERT INTO gamification_points (tenant_id, employee_id, employee_name, point_type, points, reference_id, reference_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [tenantId, employeeId, employeeName||null, pointType, points, referenceId||null, referenceType||null]);

  // Update employee totals
  const newLevel = await recalcProfile(tenantId, employeeId, employeeName);
  return { points_awarded: points, new_level: newLevel };
}

async function recalcProfile(tenantId, employeeId, employeeName) {
  const totals = await adminQuery(
    'SELECT COALESCE(SUM(points),0) as total FROM gamification_points WHERE tenant_id=$1 AND employee_id=$2',
    [tenantId, employeeId]
  );
  const spent = await adminQuery(
    "SELECT COALESCE(SUM(points_spent),0) as spent FROM gamification_reward_claims WHERE tenant_id=$1 AND employee_id=$2 AND status='approved'",
    [tenantId, employeeId]
  );
  const totalPts     = parseInt(totals.rows[0].total);
  const spentPts     = parseInt(spent.rows[0].spent);
  const availablePts = totalPts - spentPts;
  const level        = [...LEVELS].reverse().find(l => totalPts >= l.minPts)?.key || 'rookie';

  await adminQuery(`
    INSERT INTO employee_gamification (tenant_id, employee_id, employee_name, total_points, available_points, level, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (tenant_id, employee_id) DO UPDATE
    SET total_points=$4, available_points=$5, level=$6, employee_name=COALESCE($3, employee_gamification.employee_name), updated_at=now()
  `, [tenantId, employeeId, employeeName||null, totalPts, availablePts, level]);

  return level;
}

async function awardBadge(tenantId, employeeId, badgeKey) {
  const def = BADGE_DEFS.find(b=>b.key===badgeKey);
  if (!def) return;
  await adminQuery(`
    UPDATE employee_gamification
    SET badges = CASE WHEN NOT ($1 = ANY(badges)) THEN array_append(badges, $1) ELSE badges END, updated_at=now()
    WHERE tenant_id=$2 AND employee_id=$3
  `, [badgeKey, tenantId, employeeId]).catch(()=>{});
}

async function getLeaderboard(tenantId, { locationId, period = 'all_time', limit = 20 } = {}) {
  await ensureGamificationTables();
  let dateFilter = '';
  if (period === 'this_week')  dateFilter = "AND gp.created_at >= date_trunc('week', CURRENT_DATE)";
  if (period === 'this_month') dateFilter = "AND gp.created_at >= date_trunc('month', CURRENT_DATE)";

  const locFilter = locationId ? `AND eg.location_id='${locationId}'` : '';

  const r = await adminQuery(`
    SELECT
      eg.employee_id, eg.employee_name, eg.level, eg.badges, eg.streak_days,
      eg.total_points, eg.available_points,
      COALESCE(SUM(gp.points) FILTER (WHERE gp.created_at >= date_trunc('week', CURRENT_DATE)), 0) as points_this_week,
      COALESCE(SUM(gp.points) FILTER (WHERE gp.created_at >= date_trunc('month', CURRENT_DATE)), 0) as points_this_month,
      COUNT(DISTINCT tc.module_id) as modules_completed,
      RANK() OVER (ORDER BY eg.total_points DESC) as rank
    FROM employee_gamification eg
    LEFT JOIN gamification_points gp ON gp.employee_id = eg.employee_id AND gp.tenant_id = eg.tenant_id ${dateFilter}
    LEFT JOIN training_completions tc ON tc.employee_id = eg.employee_id AND tc.tenant_id = eg.tenant_id
    WHERE eg.tenant_id=$1 ${locFilter}
    GROUP BY eg.employee_id, eg.employee_name, eg.level, eg.badges, eg.streak_days, eg.total_points, eg.available_points
    ORDER BY eg.total_points DESC
    LIMIT $2
  `, [tenantId, limit]);
  return r.rows;
}

async function getEmployeeProfile(tenantId, employeeId) {
  await ensureGamificationTables();
  await recalcProfile(tenantId, employeeId, null);
  const [profile, recentPoints, completions, activeChallenges] = await Promise.all([
    adminQuery('SELECT * FROM employee_gamification WHERE tenant_id=$1 AND employee_id=$2', [tenantId, employeeId]),
    adminQuery('SELECT * FROM gamification_points WHERE tenant_id=$1 AND employee_id=$2 ORDER BY created_at DESC LIMIT 20', [tenantId, employeeId]),
    adminQuery(`SELECT tc.*, tm.title, tm.category FROM training_completions tc JOIN training_modules tm ON tm.id=tc.module_id WHERE tc.tenant_id=$1 AND tc.employee_id=$2 ORDER BY tc.completed_at DESC`, [tenantId, employeeId]),
    adminQuery(`SELECT gce.*, gc.title, gc.target, gc.metric, gc.end_date, gc.points_reward FROM gamification_challenge_entries gce JOIN gamification_challenges gc ON gc.id=gce.challenge_id WHERE gce.tenant_id=$1 AND gce.employee_id=$2 AND gc.status='active' AND gc.end_date >= CURRENT_DATE`, [tenantId, employeeId]),
  ]);
  const p = profile.rows[0] || { total_points:0, available_points:0, level:'rookie', badges:[] };
  const currentLevel = LEVELS.find(l=>l.key===p.level) || LEVELS[0];
  const nextLevel    = LEVELS[LEVELS.indexOf(currentLevel)+1] || null;
  return {
    ...p,
    current_level:    currentLevel,
    next_level:       nextLevel,
    points_to_next:   nextLevel ? nextLevel.minPts - p.total_points : 0,
    recent_points:    recentPoints.rows,
    completions:      completions.rows,
    active_challenges:activeChallenges.rows,
    badge_defs:       BADGE_DEFS.filter(b => (p.badges||[]).includes(b.key)),
  };
}

// ── Challenges ────────────────────────────────────────────────────────────────
async function getChallenges(tenantId, { locationId, status = 'active' } = {}) {
  await ensureGamificationTables();
  let where = 'gc.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (locationId) { where += ` AND (gc.location_id=$${i++} OR gc.location_id IS NULL)`; params.push(locationId); }
  if (status)     { where += ` AND gc.status=$${i++}`; params.push(status); }

  const r = await adminQuery(`
    SELECT gc.*,
      COUNT(gce.id) as participant_count,
      COUNT(gce.id) FILTER (WHERE gce.completed) as completion_count
    FROM gamification_challenges gc
    LEFT JOIN gamification_challenge_entries gce ON gce.challenge_id = gc.id
    WHERE ${where}
    GROUP BY gc.id ORDER BY gc.end_date ASC
  `, params);
  return r.rows;
}

async function createChallenge(tenantId, data) {
  await ensureGamificationTables();
  const { locationId, title, description, challengeType, metric, target,
          pointsReward, bonusReward, startDate, endDate, createdBy } = data;
  const r = await adminQuery(`
    INSERT INTO gamification_challenges
      (tenant_id, location_id, title, description, challenge_type, metric, target,
       points_reward, bonus_reward, start_date, end_date, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
  `, [tenantId, locationId||null, title, description||null, challengeType||'individual',
      metric, target, pointsReward||200, bonusReward||null, startDate, endDate, createdBy||null]);
  return r.rows[0];
}

async function updateChallengeProgress(tenantId, challengeId, employeeId, employeeName, progress) {
  await ensureGamificationTables();
  const challenge = await adminQuery('SELECT * FROM gamification_challenges WHERE id=$1', [challengeId]);
  const c = challenge.rows[0];
  if (!c) return;

  const completed = parseFloat(progress) >= parseFloat(c.target);
  const r = await adminQuery(`
    INSERT INTO gamification_challenge_entries (tenant_id, challenge_id, employee_id, employee_name, progress, completed, completed_at)
    VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $6 THEN now() ELSE NULL END)
    ON CONFLICT (challenge_id, employee_id) DO UPDATE
    SET progress=$5, completed=$6, completed_at=CASE WHEN $6 AND NOT gamification_challenge_entries.completed THEN now() ELSE gamification_challenge_entries.completed_at END
    RETURNING *
  `, [tenantId, challengeId, employeeId, employeeName||null, progress, completed]);

  // Award points on first completion
  const entry = r.rows[0];
  if (completed && entry) {
    await awardPoints(tenantId, employeeId, employeeName, 'challenge_complete', c.points_reward, challengeId, 'challenge');
    await awardBadge(tenantId, employeeId, 'challenge_winner');
  }
  return entry;
}

// ── Rewards ───────────────────────────────────────────────────────────────────
async function getRewards(tenantId) {
  await ensureGamificationTables();
  const r = await adminQuery('SELECT * FROM gamification_rewards WHERE tenant_id=$1 AND active=true ORDER BY points_cost', [tenantId]);
  return r.rows;
}

async function upsertReward(tenantId, data) {
  await ensureGamificationTables();
  const { id, title, description, rewardType, value, pointsCost, active } = data;
  if (id) {
    const r = await adminQuery('UPDATE gamification_rewards SET title=$1,description=$2,reward_type=$3,value=$4,points_cost=$5,active=$6 WHERE id=$7 AND tenant_id=$8 RETURNING *',
      [title, description||null, rewardType||'gift_card', value||null, pointsCost, active??true, id, tenantId]);
    return r.rows[0];
  }
  const r = await adminQuery('INSERT INTO gamification_rewards (tenant_id,title,description,reward_type,value,points_cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [tenantId, title, description||null, rewardType||'gift_card', value||null, pointsCost]);
  return r.rows[0];
}

async function claimReward(tenantId, rewardId, employeeId, employeeName) {
  await ensureGamificationTables();
  const [reward, profile] = await Promise.all([
    adminQuery('SELECT * FROM gamification_rewards WHERE id=$1 AND tenant_id=$2', [rewardId, tenantId]),
    adminQuery('SELECT available_points FROM employee_gamification WHERE tenant_id=$1 AND employee_id=$2', [tenantId, employeeId]),
  ]);
  const r  = reward.rows[0];
  const p  = profile.rows[0];
  if (!r) throw Object.assign(new Error('Reward not found'), {status:404});
  if (!p || p.available_points < r.points_cost) throw Object.assign(new Error(`Not enough points — need ${r.points_cost}, have ${p?.available_points||0}`), {status:400});

  const claim = await adminQuery(`
    INSERT INTO gamification_reward_claims (tenant_id, reward_id, employee_id, employee_name, points_spent)
    VALUES ($1,$2,$3,$4,$5) RETURNING *
  `, [tenantId, rewardId, employeeId, employeeName||null, r.points_cost]);
  return claim.rows[0];
}

async function reviewRewardClaim(tenantId, claimId, { approved, managerNotes, reviewedBy }) {
  const status = approved ? 'approved' : 'declined';
  const r = await adminQuery(
    'UPDATE gamification_reward_claims SET status=$1, manager_notes=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 AND tenant_id=$5 RETURNING *',
    [status, managerNotes||null, reviewedBy, claimId, tenantId]
  );
  if (approved && r.rows[0]) {
    await recalcProfile(tenantId, r.rows[0].employee_id, null);
  }
  return r.rows[0];
}

async function getRewardClaims(tenantId, { status, employeeId } = {}) {
  let where = 'grc.tenant_id=$1'; const params = [tenantId]; let i = 2;
  if (status)     { where += ` AND grc.status=$${i++}`; params.push(status); }
  if (employeeId) { where += ` AND grc.employee_id=$${i++}`; params.push(employeeId); }
  const r = await adminQuery(`
    SELECT grc.*, gr.title as reward_title, gr.reward_type, gr.value
    FROM gamification_reward_claims grc
    JOIN gamification_rewards gr ON gr.id = grc.reward_id
    WHERE ${where} ORDER BY grc.created_at DESC
  `, params);
  return r.rows;
}

// ── AI Coaching ────────────────────────────────────────────────────────────────
async function getAICoaching(tenantId, employeeId, employeeName) {
  await ensureGamificationTables();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const [profile, completions, points] = await Promise.all([
    adminQuery('SELECT * FROM employee_gamification WHERE tenant_id=$1 AND employee_id=$2', [tenantId, employeeId]),
    adminQuery(`SELECT tm.title, tm.category, tc.passed, tc.score FROM training_completions tc JOIN training_modules tm ON tm.id=tc.module_id WHERE tc.tenant_id=$1 AND tc.employee_id=$2 ORDER BY tc.completed_at DESC LIMIT 10`, [tenantId, employeeId]),
    adminQuery(`SELECT point_type, SUM(points) as total FROM gamification_points WHERE tenant_id=$1 AND employee_id=$2 GROUP BY point_type`, [tenantId, employeeId]),
  ]);

  const p = profile.rows[0] || {};
  const pointsByType = Object.fromEntries(points.rows.map(r=>[r.point_type, parseInt(r.total)]));
  const completedModules = completions.rows.map(c=>c.title).join(', ') || 'none yet';

  const prompt = `You are a restaurant performance coach. Generate 3 personalized, actionable coaching tips for this employee.

Employee: ${employeeName || 'Team member'}
Level: ${p.level || 'rookie'} (${p.total_points || 0} total points)
Completed training: ${completedModules}
Points breakdown: ${JSON.stringify(pointsByType)}

Focus on: upselling techniques, menu knowledge, APC improvement, and guest experience.
Make tips specific to an upscale Indian restaurant context (think: wine pairings with tandoor dishes, cocktail upsells like signature Aparajita Fizz, suggesting tasting menus).

Return ONLY a JSON array of 3 objects, no markdown:
[{ "title": "short title", "tip": "2-3 sentence actionable tip", "category": "upselling|knowledge|service|mindset", "impact": "high|medium" }]`;

  // replaced by callClaude
  const text = json.content[0].text.replace(/```json?|```/g,'').trim();
  return JSON.parse(text);
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function getGamificationSummary(tenantId, locationId) {
  await ensureGamificationTables();
  const params = [tenantId];
  const locFilter = locationId ? ` AND location_id='${locationId}'` : '';

  const [employees, challenges, rewards, topLearner] = await Promise.all([
    adminQuery(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE level!='rookie') as leveled_up, COALESCE(SUM(total_points),0) as total_pts FROM employee_gamification WHERE tenant_id=$1${locFilter}`, params),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='active' AND end_date < CURRENT_DATE+7) as ending_soon FROM gamification_challenges WHERE tenant_id=$1${locFilter}`, params),
    adminQuery(`SELECT COUNT(*) FILTER (WHERE status='pending') as pending FROM gamification_reward_claims WHERE tenant_id=$1`, params),
    adminQuery(`SELECT employee_name, total_points, level FROM employee_gamification WHERE tenant_id=$1${locFilter} ORDER BY total_points DESC LIMIT 1`, params),
  ]);

  return {
    employees:   employees.rows[0],
    challenges:  challenges.rows[0],
    rewards:     rewards.rows[0],
    top_learner: topLearner.rows[0] || null,
    levels:      LEVELS,
    badge_defs:  BADGE_DEFS,
    categories:  LEARNING_CATEGORIES,
    point_rules: POINT_RULES,
  };
}

module.exports = {
  ensureGamificationTables, LEVELS, BADGE_DEFS, LEARNING_CATEGORIES, POINT_RULES,
  getModules, upsertModule, deleteModule, completeModule, getCompletions,
  awardPoints, awardBadge, recalcProfile,
  getLeaderboard, getEmployeeProfile,
  getChallenges, createChallenge, updateChallengeProgress,
  getRewards, upsertReward, claimReward, reviewRewardClaim, getRewardClaims,
  getAICoaching, getGamificationSummary,
};
