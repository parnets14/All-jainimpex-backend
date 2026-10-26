/**
 * Order-creation idempotency.
 *
 * WHY THIS EXISTS
 * The sales order is SAVED before the (slower) post-processing runs, so a client
 * timeout is ambiguous — the order may already exist. Without a token the user
 * retries and creates a duplicate; on an auto-split save, a duplicate PAIR.
 * These checks pin the three parts that make a retry safe:
 *
 *   1. the token is normalised consistently (`readClientRequestId`)
 *   2. both create endpoints REPLAY an existing order instead of inserting
 *   3. the token is persisted, and the model enforces one order per
 *      (token, salesType) so the two split siblings can still coexist
 *
 * Run: node utils/__orderIdempotency.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const CONTROLLER = fs.readFileSync(
  path.join(BACKEND, 'controllers', 'salesOrderController.js'),
  'utf8'
);
const MODEL = fs.readFileSync(path.join(BACKEND, 'models', 'SalesOrder.js'), 'utf8');

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

/** Evaluate the real `readClientRequestId` from the controller source. */
const extractReadClientRequestId = () => {
  const start = CONTROLLER.indexOf('const readClientRequestId');
  assert.notEqual(start, -1, 'readClientRequestId not found in the controller');
  const end = CONTROLLER.indexOf('\n};', start);
  assert.notEqual(end, -1, 'could not find the end of readClientRequestId');
  const decl = CONTROLLER.slice(start, end + 3);
  // eslint-disable-next-line no-new-func
  return new Function(`${decl}; return readClientRequestId;`)();
};

const readClientRequestId = extractReadClientRequestId();

console.log('\n--- readClientRequestId: absent stays absent, present is bounded ---');

test('missing / null / empty all mean "no token"', () => {
  assert.equal(readClientRequestId({}), null);
  assert.equal(readClientRequestId({ clientRequestId: null }), null);
  assert.equal(readClientRequestId({ clientRequestId: undefined }), null);
  assert.equal(readClientRequestId({ clientRequestId: '' }), null);
  assert.equal(readClientRequestId({ clientRequestId: '   ' }), null);
  assert.equal(readClientRequestId(), null);
});

test('a real token is preserved and trimmed', () => {
  assert.equal(readClientRequestId({ clientRequestId: 'abc-123' }), 'abc-123');
  assert.equal(readClientRequestId({ clientRequestId: '  abc-123  ' }), 'abc-123');
});

test('a UUID survives unchanged (what the dashboard sends)', () => {
  const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  assert.equal(readClientRequestId({ clientRequestId: uuid }), uuid);
});

test('the token is bounded so a hostile payload cannot bloat the index', () => {
  const huge = 'x'.repeat(500);
  assert.equal(readClientRequestId({ clientRequestId: huge }).length, 100);
});

test('numbers are coerced rather than rejected', () => {
  assert.equal(readClientRequestId({ clientRequestId: 12345 }), '12345');
});

console.log('\n--- both create endpoints replay instead of duplicating ---');

const countMatches = (source, re) => (source.match(re) || []).length;

test('createSalesOrder looks up an existing order by token BEFORE inserting', () => {
  // Must be the REPLAY block (guarded by the freshly-read token), not the
  // duplicate-key race handler further down — that one also queries by token.
  assert.ok(
    /clientRequestId = readClientRequestId\(req\.body\);\s*\n\s*if \(clientRequestId\) \{\s*\n\s*const existingOrder = await SalesOrder\.findOne\(\{ clientRequestId \}\)\.lean\(\)/.test(CONTROLLER),
    'createSalesOrder no longer replays by clientRequestId before inserting'
  );
});

test('createSalesOrderWithAutoSplit looks up existing orders by token BEFORE splitting', () => {
  assert.ok(
    /clientRequestId = readClientRequestId\(req\.body\);\s*\n\s*if \(clientRequestId\) \{\s*\n\s*const existingOrders = await SalesOrder\.find\(\{ clientRequestId \}\)\.lean\(\)/.test(CONTROLLER),
    'auto-split no longer replays by clientRequestId before splitting'
  );
});

test('both endpoints return idempotentReplay so the client can tell', () => {
  assert.ok(
    countMatches(CONTROLLER, /idempotentReplay: true/g) >= 4,
    'expected idempotentReplay on both replay paths and both duplicate-key races'
  );
});

test('the token is persisted on both create paths', () => {
  assert.ok(
    /clientRequestId: clientRequestId \|\| null/.test(CONTROLLER),
    'createSalesOrder no longer persists the token'
  );
  assert.ok(
    /clientRequestId: readClientRequestId\(\{ clientRequestId \}\) \|\| null/.test(CONTROLLER),
    'createSingleSalesOrder no longer persists the token (split siblings would lose it)'
  );
});

test('a duplicate-key race is resolved by re-reading the token, not by erroring', () => {
  assert.ok(
    /error\.code === 11000[\s\S]{0,600}clientRequestId/.test(CONTROLLER),
    'the 11000 handler does not consider the idempotency index'
  );
});

console.log('\n--- the model enforces the invariant ---');

test('the token is a schema field', () => {
  assert.ok(/clientRequestId:\s*\{/.test(MODEL), 'clientRequestId is not in the schema');
});

test('the index is unique on (clientRequestId, salesType) — NOT on the token alone', () => {
  assert.ok(
    /\{\s*clientRequestId:\s*1,\s*salesType:\s*1\s*\}/.test(MODEL),
    'expected a compound index so the two split siblings can share one token'
  );
  assert.ok(
    !/\{\s*clientRequestId:\s*1\s*\},\s*\n?\s*\{[^}]*unique/.test(MODEL),
    'a unique index on clientRequestId ALONE would reject the second split sibling'
  );
});

test('the index is partial, so legacy rows without the field are unaffected', () => {
  assert.ok(
    /partialFilterExpression:\s*\{\s*clientRequestId:\s*\{\s*\$type:\s*'string'\s*\}/.test(MODEL),
    'expected a partialFilterExpression on clientRequestId'
  );
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
