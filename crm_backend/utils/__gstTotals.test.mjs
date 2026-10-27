/**
 * Balance Sheet GST totals must include service-charge tax.
 *
 * WHY THIS EXISTS
 * `totalGst` on DealerInvoice / SupplierInvoice is the GST on PRODUCT lines only;
 * service-charge tax is stored separately in `serviceChargesTax`. The Balance
 * Sheet used to sum `totalGst` alone, which understated output GST and input
 * credit by the service-charge tax — and made the Balance Sheet disagree with
 * the GST report, which adds the two explicitly. That is a reporting defect the
 * client would see, not a cosmetic one.
 *
 * Run: node utils/__gstTotals.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const SOURCE = fs.readFileSync(
  path.join(BACKEND, 'controllers', 'balanceSheetController.js'),
  'utf8'
);

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

// The exact expression that understated the figure.
const BAD_SUM = /\$sum:\s*'\$totalGst'/;

console.log('\n--- no aggregation sums product GST alone ---');

test('the raw `$sum: \'$totalGst\'` expression is gone', () => {
  assert.equal(BAD_SUM.test(SOURCE), false,
    'an aggregation still sums totalGst without serviceChargesTax');
});

test('every GST aggregation also adds serviceChargesTax', () => {
  // Split on the aggregation marker rather than regex-matching the whole nested
  // $group object — the fixed expression spans several lines and nests braces.
  const parts = SOURCE.split('$group: { _id: null, totalGst:');
  const windows = parts.slice(1).map((p) => p.slice(0, 500));
  assert.ok(windows.length >= 4, `expected at least 4 GST aggregations, found ${windows.length}`);
  const missing = windows.filter((w) => !w.includes('serviceChargesTax'));
  assert.equal(missing.length, 0,
    `${missing.length} GST aggregation(s) omit serviceChargesTax`);
});

test('the gstPayable drill-down projects and adds serviceChargesTax', () => {
  const start = SOURCE.indexOf("case 'gstPayable'");
  assert.notEqual(start, -1, 'gstPayable drill-down not found');
  const block = SOURCE.slice(start, start + 1400);
  assert.ok(block.includes('serviceChargesTax'), 'drill-down does not read serviceChargesTax');
  assert.ok(
    /\(inv\.totalGst \|\| 0\) \+ \(inv\.serviceChargesTax \|\| 0\)/.test(block),
    'drill-down amount does not add the two'
  );
});

console.log('\n--- self-test: the guard can actually fail ---');

test('the bad pattern is detected in a known-bad sample', () => {
  const bad = "{ $group: { _id: null, totalGst: { $sum: '$totalGst' } } }";
  assert.equal(BAD_SUM.test(bad), true, 'guard would not catch the historical bug');
});

test('the bad pattern does not match the fixed expression', () => {
  const good = "{ $sum: { $add: [ { $ifNull: ['$totalGst', 0] }, { $ifNull: ['$serviceChargesTax', 0] } ] } }";
  assert.equal(BAD_SUM.test(good), false, 'guard would false-positive on the fix');
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
