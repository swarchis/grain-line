// ─── RestaurantOS — Database client ──────────────────────────────────────────
// Exports a single pg Pool instance used by all agent routes.
// Sets app.tenant_id on every connection so RLS policies fire correctly.

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max:             20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Run a query in the context of a tenant.
 * Sets app.tenant_id so PostgreSQL RLS policies apply.
 *
 * @param {string} tenantId
 * @param {string} text     - SQL query
 * @param {any[]}  params   - Query parameters
 */
async function queryForTenant(tenantId, text, params = []) {
  const client = await pool.connect();
  try {
    // Set tenant context for RLS — must be done in same transaction
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Run multiple queries in a transaction within a tenant context.
 *
 * @param {string}   tenantId
 * @param {Function} fn      - async (client) => { ... }
 */
async function transactionForTenant(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin query — bypasses RLS (for migrations, seeds, admin tasks only).
 * NEVER call this from agent route handlers.
 */
async function adminQuery(text, params = []) {
  return pool.query(text, params);
}

/**
 * Health check — verify DB is reachable
 */
async function ping() {
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

module.exports = { pool, queryForTenant, transactionForTenant, adminQuery, ping };
