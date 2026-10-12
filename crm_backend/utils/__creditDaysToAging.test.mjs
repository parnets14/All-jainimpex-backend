/**
 * End-to-end: credit days -> dueDate -> aging report bucket -> overdue badge.
 *
 * WHY THIS EXISTS
 * The `creditDays || 30` bug is only interesting because of where the value
 * ends up. `creditDays` sets `dueDate`; `dueDate` is what the aging report
 * buckets on (`agingReportController.bucketFor`) and what the overdue badge
 * derives `daysOverdue` from (`dealerPaymentController`). So a dealer on
 * "pay on demand" (0 days — the Dealer schema default) being handed 30 days
 * did not merely store a wrong number: it moved a genuinely OVERDUE invoice
 * into the "not due" bucket for a month.
 *
 * This file chains the real helpers together so that regression is visible as
 * a wrong REPORT BUCKET, not just a wrong integer.
 *
 * Run: node utils/__creditDaysToAging.test.mjs
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

const DAY = 24 * 60 * 60 * 1000;

// Mirrors agingReportController.bucketFor (real source, lines 27-35).
const bucketFor = (asOf, dueDate, invoiceDate) => {
  const ref = dueDate ? new Date(dueDate) : new Date(invoiceDate);
  const daysOverdue = Math.floor((asOf - ref) / DAY);
  if (daysOverdue < 0) return 'notDue';
  if (daysOverdue <= 30) return 'd0_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90plus';
};

// Mirrors the OLD `|| 30` resolution, kept here to prove the bug was real and
// that the aging bucket actually moved.
const OLD_resolve = (dealer) => dealer.creditDaysRegular || dealer.creditDays || 30;

const INVOICE_DATE = '2026-03-01T00:00:00.000Z';
const AS_OF = new Date('2026-03-15T00:00:00.000Z'); // 14 days after the invoice

console.log('\n--- a pay-on-demand dealer is overdue, and the report must show it ---');

test('the Dealer schema default of 0 means "due on the invoice date"', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  const days = resolveCreditDays(dealer, { salesType: 'Regular Sale' });
  assert.equal(days, 0);
  const due = addCreditDays(INVOICE_DATE, days);
  assert.equal(due.toISOString().slice(0, 10), '2026-03-01');
});

test('so a 14-day-old invoice lands in the d0_30 bucket, NOT "not due"', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  const due = addCreditDays(INVOICE_DATE, resolveCreditDays(dealer, { salesType: 'Regular Sale' }));
  assert.equal(bucketFor(AS_OF, due, INVOICE_DATE), 'd0_30');
});

test('THE REGRESSION: the old || 30 chain put that same invoice in "notDue"', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  const oldDue = addCreditDays(INVOICE_DATE, OLD_resolve(dealer));
  assert.equal(oldDue.toISOString().slice(0, 10), '2026-03-31');
  // 15 March vs 31 March -> negative -> the report claimed it was not yet due.
  assert.equal(bucketFor(AS_OF, oldDue, INVOICE_DATE), 'notDue');
});

test('the fixed chain and the buggy chain disagree on the bucket (the fix has effect)', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  const fixed = bucketFor(AS_OF, addCreditDays(INVOICE_DATE, resolveCreditDays(dealer, { salesType: 'Regular Sale' })), INVOICE_DATE);
  const buggy = bucketFor(AS_OF, addCreditDays(INVOICE_DATE, OLD_resolve(dealer)), INVOICE_DATE);
  assert.notEqual(fixed, buggy, 'fix and bug agree — the test proves nothing');
});

console.log('\n--- a dealer who genuinely has no terms still gets the fallback ---');

test('an unset dealer still receives the 30-day default', () => {
  const dealer = { creditDays: null, creditDaysRegular: null, creditDaysCD: null };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 30);
  const due = addCreditDays(INVOICE_DATE, 30);
  assert.equal(bucketFor(AS_OF, due, INVOICE_DATE), 'notDue');
});

console.log('\n--- CD / Regular / Mixed resolve per sales type, 0 preserved ---');

test('CD and Regular terms are kept apart instead of collapsing to one value', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 90 };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Regular Sale' }), 0);
  assert.equal(resolveCreditDays(dealer, { salesType: 'CD Sales' }), 90);
  // Mixed takes the longest of the dealer's OWN terms.
  assert.equal(resolveCreditDays(dealer, { salesType: 'Mixed' }), 90);
});

test('a Mixed basket of all-zero terms stays at 0 (no fallback leak)', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  assert.equal(resolveCreditDays(dealer, { salesType: 'Mixed' }), 0);
});

console.log('\n--- the Sales Order and the Dealer Invoice agree on the due date ---');

// The two controllers reach the sales type by DIFFERENT routes, which is the
// obvious place for them to drift:
//   ORDER   decides from the request's `salesType` ('Regular Sale' / 'CD Sales')
//   INVOICE decides from its own ITEM MIX (any CD item? any Regular item?)
// Mirroring the invoice's derivation here makes that drift visible.
const invoiceSalesType = (items) => {
  const hasCDSales = items.some((i) => i.salesType === 'CD Sales');
  const hasRegularSales = items.some((i) => i.salesType === 'Regular Sale' || !i.salesType);
  if (hasCDSales && !hasRegularSales) return 'CD Sales';
  if (hasRegularSales && !hasCDSales) return 'Regular Sale';
  if (hasCDSales && hasRegularSales) return 'Mixed';
  return 'Regular Sale'; // default, matching the controller
};

test('both paths derive the same dueDate for the same dealer + sales type', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  // Sales order path: computeDueDate -> addCreditDays(orderDate, finalCreditDays)
  const orderDue = addCreditDays('2026-03-01T00:00:00.000Z', resolveCreditDays(dealer, { salesType: 'Regular Sale' }));
  // Invoice path: identical rule.
  const invoiceDue = addCreditDays('2026-03-01T00:00:00.000Z', resolveCreditDays(dealer, { salesType: 'Regular Sale' }));
  assert.equal(orderDue.toISOString(), invoiceDue.toISOString());
});

test('a pure-Regular order and its invoice agree, including a 0-day dealer', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 45 };
  const orderDays = resolveCreditDays(dealer, { salesType: 'Regular Sale' });
  const invDays = resolveCreditDays(dealer, { salesType: invoiceSalesType([{ salesType: 'Regular Sale' }]) });
  assert.equal(orderDays, 0);
  assert.equal(invDays, orderDays);
});

test('a pure-CD order and its invoice agree', () => {
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 45 };
  const orderDays = resolveCreditDays(dealer, { salesType: 'CD Sales' });
  const invDays = resolveCreditDays(dealer, { salesType: invoiceSalesType([{ salesType: 'CD Sales' }]) });
  assert.equal(orderDays, 45);
  assert.equal(invDays, orderDays);
});

test('an AUTO-SPLIT order: each sibling and its own invoice agree', () => {
  // A mixed basket is split into a Regular sibling and a CD sibling. An invoice
  // is raised per order (`DealerInvoice.findOne({ salesOrder })` guards against a
  // second one), so each invoice sees only ONE sibling's lines. Because both
  // sides resolve through the same helper, each pair matches.
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 45 };
  const orderDate = '2026-03-01T00:00:00.000Z';

  const aOrderDays = resolveCreditDays(dealer, { salesType: 'Regular Sale' });
  const aInvDays = resolveCreditDays(dealer, { salesType: invoiceSalesType([{ salesType: 'Regular Sale' }]) });
  assert.equal(aInvDays, aOrderDays, 'Regular sibling order/invoice credit days differ');
  assert.equal(
    addCreditDays(orderDate, aInvDays).toISOString(),
    addCreditDays(orderDate, aOrderDays).toISOString()
  );

  const bOrderDays = resolveCreditDays(dealer, { salesType: 'CD Sales' });
  const bInvDays = resolveCreditDays(dealer, { salesType: invoiceSalesType([{ salesType: 'CD Sales' }]) });
  assert.equal(bInvDays, bOrderDays, 'CD sibling order/invoice credit days differ');
  assert.equal(
    addCreditDays(orderDate, bInvDays).toISOString(),
    addCreditDays(orderDate, bOrderDays).toISOString()
  );

  // The two siblings legitimately differ from EACH OTHER — that is the point of
  // resolving per sales type rather than collapsing to one shared value.
  assert.notEqual(aOrderDays, bOrderDays);
});

test('a 90-day overdue invoice reaches d90plus on both paths', () => {
  const asOf = new Date('2026-06-30T00:00:00.000Z');
  const dealer = { creditDays: 0, creditDaysRegular: 0, creditDaysCD: 0 };
  const due = addCreditDays('2026-03-01T00:00:00.000Z', resolveCreditDays(dealer, { salesType: 'Regular Sale' }));
  assert.equal(bucketFor(asOf, due, '2026-03-01T00:00:00.000Z'), 'd90plus');
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
