// api/config/aiCredits.js
// AUTHORITATIVE per-feature credit costs + per-tier monthly grants for the AI
// credit system. The backend enforces these; the frontend mirror in
// la-guia/src/data/aiCredits.js is for display only and MUST be kept in sync.
//
// Costs are sized so a tier's monthly grant stays under ~20% of its price:
// Basic $29 -> 500 credits, Premium $79 -> 1500 credits. Tune here first.

const FEATURE_COST = {
  'chat-reply': 1,
  'design-color-palette': 3,
  'analyze-design': 5,
  'generate-tech-pack': 5,
  'parse-vendor': 5,
  'draft-vendor-email': 5,
  'analyze-vendor-fit': 5,
  'dashboard-suggestions': 5,
  'quote-economics': 5,
  'cost-simulator': 5,
  'generate-tech-pack-full': 10,
  'search-vendors': 10,
  'design-generate-element': 10,
  'design-trend-inspiration': 10,
  'design-ai-image': 25,
};

// Fallback for any feature not explicitly priced.
const DEFAULT_COST = 5;

// Per-tier monthly subscription grant. MUST match plans.js creditsPerMonth and
// the CASE in migration 028_ai_credits.sql.
const TIER_CREDITS = {
  free: 0,
  basic: 500,
  premium: 1500,
};

function creditCost(feature) {
  return Object.prototype.hasOwnProperty.call(FEATURE_COST, feature)
    ? FEATURE_COST[feature]
    : DEFAULT_COST;
}

function tierCredits(tier) {
  return Object.prototype.hasOwnProperty.call(TIER_CREDITS, tier)
    ? TIER_CREDITS[tier]
    : 0;
}

module.exports = { FEATURE_COST, DEFAULT_COST, TIER_CREDITS, creditCost, tierCredits };
