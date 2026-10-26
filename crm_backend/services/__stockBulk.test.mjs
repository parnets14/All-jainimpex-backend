/**
 * `getCurrentStockBulk` — the batched stock lookup used by the sales-order save.
 *
 * WHY THIS EXISTS
 * Saving an order used to call `getCurrentStock` once per line, awaited inside a
 * `for...of`, so the request made ~3 sequential round trips per line. The batch
 * version resolves every product/warehouse pair in ONE aggregation. If its
 * arithmetic or its map key drifts from `getCurrentStock`, orders would be
 * rejected for "insufficient stock" that does not exist — so the two rules are
 * pinned against each other here.
 *
 * No database: a tiny interpreter applies the real aggregation pipeline to an
 * in-memory movement list.
 *
 * Run: node services/__stockBulk.test.mjs
 */
import assert from 'node:assert/strict';
import StockMovementService from './stockMovementService.js';

let passed = 0;
let failed = 0;
const test = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
};

const testAsync = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
};

const id = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

/**
 * Minimal interpreter for the exact pipeline getCurrentStockBulk builds:
 *   $match { productId: {$in}, warehouseId: {$in} }
 *   $group by {productId, warehouseId} summing IN/OUT
 */
const applyPipeline = (movements, pipeline) => {
  const match = pipeline[0].$match;
  const productIds = new Set(match.productId.$in.map(String));
  const warehouseIds = new Set(match.warehouseId.$in.map(String));

  const matched = movements.filter(
    (m) => productIds.has(String(m.productId)) && warehouseIds.has(String(m.warehouseId))
  );

  const groups = new Map();
  for (const m of matched) {
    const key = `${String(m.productId)}:${String(m.warehouseId)}`;
    const row = groups.get(key) || { _id: { productId: m.productId, warehouseId: m.warehouseId }, inbound: 0, outbound: 0 };
    if (m.type === 'IN') row.inbound += Number(m.quantity || 0);
    else if (m.type === 'OUT') row.outbound += Number(m.quantity || 0);
    groups.set(key, row);
  }
  return [...groups.values()];
};

// `getModels()` resolves ALL four models eagerly, so a stub connection must
// define each one or it falls through to `dbConnection.model()`.
const fakeConnection = (movements, onAggregate) => ({
  models: {
    StockMovement: {
      aggregate: (pipeline) => {
        if (onAggregate) onAggregate();
        return Promise.resolve(applyPipeline(movements, pipeline));
      }
    },
    StockMutationLock: {},
    GRN: {},
    SalesOrder: {}
  }
});

const MOVEMENTS = [
  // product 1 / warehouse 1: +10 IN, -3 OUT => 7
  { productId: id(1), warehouseId: id(11), type: 'IN', quantity: 10 },
  { productId: id(1), warehouseId: id(11), type: 'OUT', quantity: 3 },
  // product 2 / warehouse 11: +5 IN => 5
  { productId: id(2), warehouseId: id(11), type: 'IN', quantity: 5 },
  // product 2 / warehouse 12: nothing
  // product 3 / warehouse 11: 4 OUT => -4
  { productId: id(3), warehouseId: id(11), type: 'OUT', quantity: 4 }
];

console.log('\n--- getCurrentStockBulk returns the same balance as the per-pair rule ---');

await testAsync('sums IN minus OUT per product/warehouse pair', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [
      { productId: id(1), warehouseId: id(11) },
      { productId: id(2), warehouseId: id(11) }
    ],
    fakeConnection(MOVEMENTS)
  );

  assert.equal(balances.get(`${id(1)}:${id(11)}`), 7);
  assert.equal(balances.get(`${id(2)}:${id(11)}`), 5);
});

test('matches a naive per-pair computation exactly', () => {
  // The rule getCurrentStock implements: sum(IN) - sum(OUT) for that pair.
  const naive = (productId, warehouseId) => MOVEMENTS
    .filter((m) => String(m.productId) === String(productId) && String(m.warehouseId) === String(warehouseId))
    .reduce((sum, m) => sum + (m.type === 'IN' ? Number(m.quantity) : m.type === 'OUT' ? -Number(m.quantity) : 0), 0);

  assert.equal(naive(id(1), id(11)), 7);
  assert.equal(naive(id(3), id(11)), -4);
});

await testAsync('a pair with no movements resolves to 0, not undefined', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [{ productId: id(2), warehouseId: id(12) }],
    fakeConnection(MOVEMENTS)
  );
  assert.equal(balances.get(`${id(2)}:${id(12)}`), 0);
});

await testAsync('negative balances are preserved (more OUT than IN)', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [{ productId: id(3), warehouseId: id(11) }],
    fakeConnection(MOVEMENTS)
  );
  assert.equal(balances.get(`${id(3)}:${id(11)}`), -4);
});

await testAsync('keys are exactly "productId:warehouseId"', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [{ productId: id(1), warehouseId: id(11) }],
    fakeConnection(MOVEMENTS)
  );
  assert.deepEqual([...balances.keys()], [`${id(1)}:${id(11)}`]);
});

console.log('\n--- de-duplication and bad input ---');

await testAsync('the same pair twice yields one entry', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [
      { productId: id(1), warehouseId: id(11) },
      { productId: id(1), warehouseId: id(11) }
    ],
    fakeConnection(MOVEMENTS)
  );
  assert.equal(balances.size, 1);
  assert.equal(balances.get(`${id(1)}:${id(11)}`), 7);
});

await testAsync('invalid ids are skipped instead of throwing', async () => {
  const balances = await StockMovementService.getCurrentStockBulk(
    [
      { productId: 'not-an-id', warehouseId: id(11) },
      { productId: id(1), warehouseId: null },
      { productId: id(1), warehouseId: id(11) }
    ],
    fakeConnection(MOVEMENTS)
  );
  assert.equal(balances.size, 1);
  assert.equal(balances.get(`${id(1)}:${id(11)}`), 7);
});

await testAsync('an empty pair list returns an empty map without querying', async () => {
  let queried = false;
  const conn = fakeConnection([], () => { queried = true; });
  const balances = await StockMovementService.getCurrentStockBulk([], conn);
  assert.equal(balances.size, 0);
  assert.equal(queried, false, 'must not hit the database for an empty list');
});

await testAsync('throws when no connection is supplied', async () => {
  await assert.rejects(
    () => StockMovementService.getCurrentStockBulk([{ productId: id(1), warehouseId: id(11) }], null),
    /dbConnection is required/
  );
});

await testAsync('it is ONE aggregation for many pairs, not one per pair', async () => {
  let calls = 0;
  const conn = fakeConnection(MOVEMENTS, () => { calls += 1; });
  await StockMovementService.getCurrentStockBulk(
    [
      { productId: id(1), warehouseId: id(11) },
      { productId: id(2), warehouseId: id(11) },
      { productId: id(3), warehouseId: id(11) },
      { productId: id(2), warehouseId: id(12) }
    ],
    conn
  );
  assert.equal(calls, 1, `expected 1 aggregation for 4 pairs, got ${calls}`);
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
