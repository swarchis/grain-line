// ── Unit: tableCache ──────────────────────────────────────────────────────────
// Run: node src/__tests__/unit.tableCache.test.js
'use strict';

const { once, reset, resetAll } = require('../lib/tableCache');
let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { console.log(`  ✓ ${msg}`); passed++; }
  else           { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}

async function run() {
  console.log('\n── tableCache unit tests ────────────────────────────────');
  resetAll();

  // Test 1: fn runs once
  let count = 0;
  const init = once('test1', async () => { count++; });
  await init(); await init(); await init();
  assert(count === 1, 'ensureTables runs only once for same key');

  // Test 2: different keys run independently
  let countA = 0, countB = 0;
  const initA = once('keyA', async () => { countA++; });
  const initB = once('keyB', async () => { countB++; });
  await initA(); await initA();
  await initB(); await initB();
  assert(countA === 1 && countB === 1, 'different keys run independently');

  // Test 3: reset forces re-run
  let countR = 0;
  const initR = once('testR', async () => { countR++; });
  await initR();
  reset('testR');
  await initR();
  assert(countR === 2, 'reset forces re-initialization');

  // Test 4: failed fn clears cache, retries on next call
  let failCount = 0;
  const initFail = once('testFail', async () => {
    failCount++;
    if (failCount === 1) throw new Error('first call fails');
  });
  try { await initFail(); } catch (_) {}
  await initFail(); // should succeed and run again
  assert(failCount === 2, 'failed init clears cache for retry');

  // Test 5: concurrent calls don't double-run
  let concCount = 0;
  const initConc = once('testConc', async () => {
    await new Promise(r => setTimeout(r, 10));
    concCount++;
  });
  await Promise.all([initConc(), initConc(), initConc()]);
  assert(concCount === 1, 'concurrent calls only run fn once');

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
