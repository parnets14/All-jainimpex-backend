/**
 * Credit-terms tests.
 *
 * The bug these guard: `creditDays` is a value where **0 is meaningful**
 * ("pay on demand"), and `Dealer.creditDays*` all default to 0. The codebase
 * resolved credit days with `||` chains, e.g.
 *
 *     dealer.creditDaysRegular || dealer.creditDays || 30
 *
 * `||` falls through on 0, so a pay-on-demand dealer silently received 30 days.
 * That value sets `dueDate`, which drives the overdue badge and the aging report
 * — so the dealer showed as current for a month when they should be overdue.
 *
 * Run: node utils/__creditTerms.test.mjs
 */
import assert from 'node:assert/strict';
import { resolveCreditDays, addCreditDays } from './creditTerms.js';

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

console.log('\n--- resolveCreditDays: 0 means pay-on-demand, not "unset" ---');

test('a dealer with 0 everywhere resolves to 0, NOT the fallback', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  // The regression: every one of these used to return 30.
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 0);
  assert.equal(resolveCreditDays(dealer, { salesType: 'CD Sales' }), 0);
  assert.equal(resolveCreditDays(dealer, { salesType: 'Mixed' }), 0);
  assert.equal(resolveCreditDays(dealer), 0);
});

test('a dealer with only the general creditDays set uses it', () => {
  const dealer = { creditDays: 15, creditDaysRegular: null, creditDaysCD: null };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 15);
  assert.equal(resolveCreditDays(dealer, { salesType: 'CD Sales' }), 15);
});

test('the sales-type-specific value wins over the general one', () => {
  const dealer = { creditDays: 7, creditDaysRegular: 15, creditDaysCD: 45 };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 15);
  assert.equal(resolveCreditDays(dealer, { salesType: 'CD Sales' }), 45);
});

test('a specific value of 0 is honoured over a non-zero general value', () => {
  // Regular terms "pay on demand" while the general default is 30: Regular must win.
  const dealer = { creditDays: 30, creditDaysRegular: 0, creditDaysCD: 60 };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 0);
});

test('Mixed uses the longest of the dealer terms (0 included in the comparison)', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 45 };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Mixed' }), 45);
  const allZero = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  assert.equal(resolveCreditDays(allZero, { salesType: 'Mixed' }), 0);
});

test('falls back only when the dealer genuinely has no value', () => {
  const empty = { creditDays: null, creditDaysRegular: undefined, creditDaysCD: null };
  assert.equal(resolveCreditDays(empty, { salesType: 'Regular Sale', fallback: 30 }), 30);
  assert.equal(resolveCreditDays(empty, { salesType: 'Regular Sale', fallback: null }), null);
  assert.equal(resolveCreditDays(null, { fallback: 30 }), 30);
});

test('treats an empty string as unset, not as 0 days', () => {
  const dealer = { creditDays: '', creditDaysRegular: '', creditDaysCD: '' };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale', fallback: 30 }), 30);
});

test('accepts numeric strings (form input arrives as strings)', () => {
  const dealer = { creditDays: '0', creditDaysRegular: '15', creditDaysCD: null };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 15);
  assert.equal(resolveCreditDays(dealer, { salesType: 'CD Sales' }), 0);
});

test('rejects negative and non-numeric values', () => {
  const dealer = { creditDays: -5, creditDaysRegular: 'soon', creditDaysCD: null };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale', fallback: 30 }), 30);
});

console.log('\n--- addCreditDays: 0 days yields the base date, not null ---');

test('0 credit days yields the base date itself', () => {
  const due = addCreditDays('2026-10-01T00:00:00.000Z', 0);
  assert.ok(due instanceof Date, 'expected a date for 0 credit days');
  assert.equal(due.toISOString().slice(0, 10), '2026-10-01');
});

test('adds the credit days to the base date', () => {
  const due = addCreditDays('2026-10-01T00:00:00.000Z', 30);
  assert.equal(due.toISOString().slice(0, 10), '2026-10-31');
});

test('returns null rather than an Invalid Date', () => {
  assert.equal(addCreditDays(null, 30), null);
  assert.equal(addCreditDays('nonsense', 30), null);
  assert.equal(addCreditDays('2026-10-01T00:00:00.000Z', 'soon'), null);
  assert.equal(addCreditDays('2026-10-01T00:00:00.000Z', null), null);
});

test('crosses a month boundary correctly', () => {
  const due = addCreditDays('2026-01-20T00:00:00.000Z', 15);
  assert.equal(due.toISOString().slice(0, 10), '2026-02-04');
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
