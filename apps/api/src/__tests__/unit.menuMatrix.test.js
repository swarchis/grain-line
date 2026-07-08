// ── Unit: menu engineering matrix logic ───────────────────────────────────────
// Run: node src/__tests__/unit.menuMatrix.test.js
'use strict';

// Extract the pure classification logic from agent11 service for unit testing
function classifyItems(items) {
  if (!items.length) return { items:[], quadrants:{}, averages:{} };
  const avgSales  = items.reduce((s,i) => s + parseFloat(i.avg_weekly_sales||0), 0) / items.length;
  const avgProfit = items.reduce((s,i) => s + parseFloat(i.gross_profit||0),      0) / items.length;
  
  const classify = item => {
    const highPop    = parseFloat(item.avg_weekly_sales||0) >= avgSales;
    const highMargin = parseFloat(item.gross_profit||0)     >= avgProfit;
    if (highPop && highMargin)  return 'star';
    if (highPop && !highMargin) return 'plowhorse';
    if (!highPop && highMargin) return 'puzzle';
    return 'dog';
  };

  const classified = items.map(i => ({ ...i, quadrant: classify(i) }));
  return {
    items: classified,
    averages: { avg_weekly_sales: avgSales, avg_gross_profit: avgProfit },
    quadrants: {
      star:      classified.filter(i => i.quadrant === 'star'),
      plowhorse: classified.filter(i => i.quadrant === 'plowhorse'),
      puzzle:    classified.filter(i => i.quadrant === 'puzzle'),
      dog:       classified.filter(i => i.quadrant === 'dog'),
    }
  };
}

function calcMargin(price, cost) {
  return price > 0 ? ((price - cost) / price * 100) : 0;
}

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { console.log(`  ✓ ${msg}`); passed++; }
  else           { console.error(`  ✗ FAIL: ${msg}`); failed++; }
}

async function run() {
  console.log('\n── menu matrix unit tests ───────────────────────────────');

  const items = [
    { id:'1', name:'Aparajita Fizz', price:18, food_cost_live:4, gross_profit:14, margin_pct:78, avg_weekly_sales:45 }, // star
    { id:'2', name:'Butter Chicken', price:28, food_cost_live:18, gross_profit:10, margin_pct:36, avg_weekly_sales:60 }, // plowhorse (high sales, below avg profit)
    { id:'3', name:'Truffle Naan',   price:16, food_cost_live:3, gross_profit:13, margin_pct:81, avg_weekly_sales:12 },  // puzzle (high margin, low sales)
    { id:'4', name:'House Salad',    price:12, food_cost_live:6, gross_profit:6,  margin_pct:50, avg_weekly_sales:10 },  // dog
  ];

  const result = classifyItems(items);

  // Averages: sales avg = (45+60+12+10)/4 = 31.75, profit avg = (14+16+13+6)/4 = 12.25
  assert(Math.abs(result.averages.avg_weekly_sales - 31.75) < 0.01, 'calculates correct avg weekly sales');
  assert(Math.abs(result.averages.avg_gross_profit - 10.75) < 0.01, 'calculates correct avg gross profit');

  // Classifications
  const byId = Object.fromEntries(result.items.map(i => [i.id, i.quadrant]));
  assert(byId['1'] === 'star',      'Aparajita Fizz is a Star (high sales + high margin)');
  assert(byId['2'] === 'plowhorse', 'Butter Chicken is a Plowhorse (high sales + low margin)');
  assert(byId['3'] === 'puzzle',    'Truffle Naan is a Puzzle (low sales + high margin)');
  assert(byId['4'] === 'dog',       'House Salad is a Dog (low sales + low margin)');

  // Quadrant counts
  assert(result.quadrants.star.length === 1,      'one star item');
  assert(result.quadrants.plowhorse.length === 1,  'one plowhorse item');
  assert(result.quadrants.puzzle.length === 1,     'one puzzle item');
  assert(result.quadrants.dog.length === 1,        'one dog item');

  // Edge: all items equal => all become dogs (below average == not above)
  const equal = [
    { id:'a', gross_profit:10, avg_weekly_sales:10 },
    { id:'b', gross_profit:10, avg_weekly_sales:10 },
  ];
  const eqResult = classifyItems(equal);
  // Both are AT the average, which means >= avg = true for both dimensions
  assert(eqResult.quadrants.star.length === 2, 'items at exactly avg threshold become stars');

  // Edge: empty array
  const empty = classifyItems([]);
  assert(empty.items.length === 0 && Object.keys(empty.quadrants).length === 0, 'handles empty item list');

  // Margin calculations
  assert(Math.abs(calcMargin(18, 4) - 77.78) < 0.01, 'margin calculation is correct');
  assert(calcMargin(0, 4) === 0, 'margin is 0 when price is 0 (no division by zero)');
  assert(Math.abs(calcMargin(28, 18) - 35.71) < 0.01, 'margin calculation for plowhorse item');

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
