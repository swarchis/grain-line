// la-guia/src/data/aiCredits.js
// DISPLAY-ONLY mirror of api/config/aiCredits.js (the authoritative source the
// backend enforces). Used to show "this action costs N credits" in the UI.
// Keep in sync with the backend file.

export const FEATURE_COST = {
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

export const DEFAULT_COST = 5;

export function creditCost(feature) {
  return Object.prototype.hasOwnProperty.call(FEATURE_COST, feature)
    ? FEATURE_COST[feature]
    : DEFAULT_COST;
}
