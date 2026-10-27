/**
 * Service-charge preparation for dealer invoices.
 *
 * WHY THIS EXISTS
 * The charge name and the TAX of a service charge belong to the
 * ServiceChargeMaster, not to the request. Before this, `chargeName`,
 * `taxApplicable` and `taxRate` were taken from the client payload and never
 * re-read — a tampered request could send `taxApplicable: false` against a
 * taxable master and pay no GST. Rows that failed validation were also dropped
 * with no indication, so a mis-selected charge simply vanished.
 *
 * These checks pin: master wins, amount stays user-owned, and nothing is
 * dropped silently.
 *
 * Run: node utils/__serviceCharges.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeServiceCharges, prepareServiceCharges } from './serviceChargeUtils.js';

let passed = 0;
let failed = 0;
const test = async (label, fn) => {
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

const ID = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

/** Minimal stand-in for `ServiceChargeMaster.find().select().lean()`. */
const fakeMasterModel = (masters, onQuery) => ({
  find: (query) => {
    if (onQuery) onQuery(query);
    const ids = (query?._id?.$in || []).map(String);
    const rows = masters.filter((m) => ids.includes(String(m._id)));
    const chain = {
      select: () => chain,
      lean: () => Promise.resolve(rows)
    };
    return chain;
  }
});

const MASTERS = [
  {
    _id: ID(1),
    chargeName: 'Freight Charges',
    description: 'Outward freight',
    sacCode: '996511',
    taxApplicable: true,
    taxRate: 18,
    isActive: true
  },
  {
    _id: ID(2),
    chargeName: 'Handling Charges',
    description: '',
    sacCode: '996719',
    taxApplicable: false,
    taxRate: 0,
    isActive: true
  }
];

console.log('\n--- normalizeServiceCharges: unchanged defensive behaviour ---');

await test('rows without a master reference or name are filtered out', () => {
  const out = normalizeServiceCharges([
    { serviceChargeId: '', chargeName: '', amount: 100 },
    { serviceChargeId: ID(1), chargeName: '', amount: 100 },
    { serviceChargeId: ID(1), chargeName: 'Freight Charges', amount: 100 }
  ]);
  assert.equal(out.length, 1);
});

await test('numeric and boolean fields are coerced', () => {
  const [row] = normalizeServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'X',
    amount: '250',
    taxApplicable: 'true',   // string, not boolean
    taxRate: '18',
    cgst: '22.5'
  }]);
  assert.equal(row.amount, 250);
  assert.equal(row.taxRate, 18);
  assert.equal(row.cgst, 22.5);
  // strict === true, so a string does NOT enable tax
  assert.equal(row.taxApplicable, false);
});

console.log('\n--- prepareServiceCharges: the master is authoritative ---');

await test('tax rate and applicability come from the MASTER, not the request', async () => {
  const { charges } = await prepareServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'Freight Charges',
    amount: 1000,
    taxApplicable: false,   // tampered: master says true
    taxRate: 0,             // tampered: master says 18
    cgst: 0,
    taxAmount: 0
  }], fakeMasterModel(MASTERS));

  assert.equal(charges.length, 1);
  assert.equal(charges[0].taxApplicable, true, 'master taxApplicable must win');
  assert.equal(charges[0].taxRate, 18, 'master taxRate must win');
});

await test('the charge NAME and SAC come from the master, not the request', async () => {
  const { charges } = await prepareServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'Something Else',   // tampered
    sacCode: '111111',              // tampered
    amount: 500
  }], fakeMasterModel(MASTERS));

  assert.equal(charges[0].chargeName, 'Freight Charges');
  assert.equal(charges[0].sacCode, '996511');
});

await test('the AMOUNT stays exactly what the user entered', async () => {
  const { charges } = await prepareServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'Freight Charges',
    amount: 1234.56
  }], fakeMasterModel(MASTERS));

  assert.equal(charges[0].amount, 1234.56);
});

await test('a non-taxable master forces the tax off even if the request enables it', async () => {
  const { charges } = await prepareServiceCharges([{
    serviceChargeId: ID(2),
    chargeName: 'Handling Charges',
    amount: 300,
    taxApplicable: true,   // tampered: master says false
    taxRate: 18
  }], fakeMasterModel(MASTERS));

  assert.equal(charges[0].taxApplicable, false);
  assert.equal(charges[0].taxRate, 0);
});

console.log('\n--- prepareServiceCharges: nothing is dropped silently ---');

await test('an incomplete row produces a warning', async () => {
  const { charges, warnings } = await prepareServiceCharges([
    { serviceChargeId: '', chargeName: '', amount: 100 },
    { serviceChargeId: ID(1), chargeName: 'Freight Charges', amount: 100 }
  ], fakeMasterModel(MASTERS));

  assert.equal(charges.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /row 1/i);
});

await test('a row pointing at a deleted master is kept AND warned about', async () => {
  const { charges, warnings } = await prepareServiceCharges([{
    serviceChargeId: ID(9),
    chargeName: 'Ghost Charge',
    amount: 100
  }], fakeMasterModel(MASTERS));

  assert.equal(charges.length, 1, 'the user-entered charge must not vanish');
  assert.equal(charges[0].chargeName, 'Ghost Charge');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no longer exists/i);
});

await test('an inactive master is applied but flagged', async () => {
  const inactive = [{ ...MASTERS[0], isActive: false }];
  const { charges, warnings } = await prepareServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'Freight Charges',
    amount: 100
  }], fakeMasterModel(inactive));

  assert.equal(charges.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /inactive/i);
});

await test('a clean payload produces no warnings', async () => {
  const { warnings } = await prepareServiceCharges([{
    serviceChargeId: ID(1),
    chargeName: 'Freight Charges',
    amount: 100
  }], fakeMasterModel(MASTERS));

  assert.deepEqual(warnings, []);
});

console.log('\n--- prepareServiceCharges: query behaviour ---');

await test('no rows means no master query at all', async () => {
  let queried = false;
  const model = fakeMasterModel(MASTERS, () => { queried = true; });
  const result = await prepareServiceCharges([], model);
  assert.deepEqual(result.charges, []);
  assert.equal(queried, false);
});

await test('many rows on the same master use ONE query', async () => {
  let calls = 0;
  const model = fakeMasterModel(MASTERS, () => { calls += 1; });
  await prepareServiceCharges([
    { serviceChargeId: ID(1), chargeName: 'Freight Charges', amount: 10 },
    { serviceChargeId: ID(1), chargeName: 'Freight Charges', amount: 20 },
    { serviceChargeId: ID(2), chargeName: 'Handling Charges', amount: 30 }
  ], model);
  assert.equal(calls, 1, `expected 1 query, got ${calls}`);
});

await test('a non-array payload is treated as no charges', async () => {
  const result = await prepareServiceCharges(undefined, fakeMasterModel(MASTERS));
  assert.deepEqual(result.charges, []);
  assert.deepEqual(result.warnings, []);
});

console.log('\n--- the invoice controller actually uses the master-resolving path ---');

const CONTROLLER = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'controllers', 'dealerInvoiceController.js'),
  'utf8'
);

await test('both create and update call prepareServiceCharges', () => {
  const calls = (CONTROLLER.match(/await prepareServiceCharges\(/g) || []).length;
  assert.ok(calls >= 2, `expected prepareServiceCharges in create AND update, found ${calls} call(s)`);
});

await test('neither path writes raw req.body.serviceCharges to the invoice', () => {
  assert.equal(
    /normalizeServiceCharges\(req\.body\.serviceCharges\)/.test(CONTROLLER),
    false,
    'a path still normalises the raw payload without resolving the master'
  );
});

await test('the warnings reach the response', () => {
  const surfaced = (CONTROLLER.match(/serviceChargeWarnings/g) || []).length;
  assert.ok(surfaced >= 4, `expected warnings to be logged and returned on both paths, found ${surfaced}`);
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
