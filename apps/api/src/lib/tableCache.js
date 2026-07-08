// ── Table initialization cache ─────────────────────────────────────────────────
// Prevents DDL queries (CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN IF NOT EXISTS)
// from running on every API request. First call initializes; subsequent calls are no-ops.
// Safe to use across agents — each agent has its own key.

const initialized = new Map();

/**
 * Wrap an ensureTables function so it only runs once per process lifetime.
 * Usage:
 *   const { once } = require('../../lib/tableCache');
 *   const ensureTables = once('agent9', async () => { ... DDL ... });
 */
function once(key, fn) {
  return async function ensureTables() {
    if (initialized.get(key)) return;
    // Mark before awaiting to prevent concurrent duplicate runs
    initialized.set(key, true);
    try {
      await fn();
    } catch (e) {
      // Reset on failure so next request retries
      initialized.delete(key);
      throw e;
    }
  };
}

/** Force re-initialization (useful in tests) */
function reset(key) { initialized.delete(key); }
function resetAll()  { initialized.clear(); }

module.exports = { once, reset, resetAll };
