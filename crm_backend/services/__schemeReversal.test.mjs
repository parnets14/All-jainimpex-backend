/**
 * Cancellation reversal for schemes.
 *
 * WHY THIS EXISTS
 * No test in this repo mentioned cancel or revoke — which is exactly where the
 * two leaks lived:
 *
 *   F1  a cancelled Sales Order kept its scheme contributions, so a cumulative
 *       scheme's running total still included goods that were never delivered;
 *   F2  a cancelled Dealer Invoice kept the achievement it froze AND the reward
 *       entitlement it created, so the dealer held a reward for a sale that no
 *       longer existed — and re-issuing the invoice could mint a second one.
 *
 * These checks pin both the decision helpers and the fact that the controllers
 * actually call them.
 *
 * Run: node services/__schemeReversal.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  releaseDocumentContributionsInList,
  planApplicationRevocations,
  markAchievementsPendingRevocation
} from './schemeEngine.js';

let passed = 0;
let failed = 0;
const check = (label, fn) => {
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
const section = (name) => console.log(`\n--- ${name} ---`);

const ID = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;
const ORDER = ID(1);
const OTHER_ORDER = ID(2);
const INVOICE = ID(3);
const OTHER_INVOICE = ID(4);

const contribution = (documentId, documentType, quantity, counted = true) => ({
  documentId,
  documentType,
  quantity,
  amount: quantity * 100,
  counted
});

/** Mirrors SchemeProgress.recomputeTotals(). */
const recompute = (contributions) => ({
  measuredQuantity: contributions.filter((c) => c.counted !== false)
    .reduce((sum, c) => sum + Number(c.quantity || 0), 0)
});

console.log('\n--- F1: releasing an order\'s contributions ---');

check('only the cancelled order\'s rows are released', () => {
  const before = [
    contribution(ORDER, 'SalesOrder', 4),
    contribution(OTHER_ORDER, 'SalesOrder', 6)
  ];
  const { contributions, released } = releaseDocumentContributionsInList(before, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  assert.equal(released, 1);
  assert.equal(contributions[0].counted, false);
  assert.equal(contributions[1].counted, true, 'another order must keep counting');
});

check('the cancelled order no longer counts toward progress', () => {
  const before = [
    contribution(ORDER, 'SalesOrder', 4),
    contribution(OTHER_ORDER, 'SalesOrder', 6)
  ];
  const { contributions } = releaseDocumentContributionsInList(before, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  assert.equal(recompute(before).measuredQuantity, 10);
  assert.equal(recompute(contributions).measuredQuantity, 6, 'cancelled 4 must drop out');
});

check('rows are KEPT, not deleted (audit trail)', () => {
  const before = [contribution(ORDER, 'SalesOrder', 4)];
  const { contributions } = releaseDocumentContributionsInList(before, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  assert.equal(contributions.length, 1, 'the row must survive for audit');
});

check('releasing twice changes nothing (idempotent)', () => {
  const before = [contribution(ORDER, 'SalesOrder', 4)];
  const first = releaseDocumentContributionsInList(before, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  const second = releaseDocumentContributionsInList(first.contributions, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  assert.equal(second.released, 0);
  assert.equal(recompute(second.contributions).measuredQuantity, 0);
});

check('an invoice\'s rows are not touched when releasing an order', () => {
  const before = [
    contribution(ORDER, 'SalesOrder', 4),
    contribution(INVOICE, 'DealerInvoice', 4)
  ];
  const { contributions } = releaseDocumentContributionsInList(before, {
    documentId: ORDER, documentType: 'SalesOrder'
  });
  assert.equal(contributions[1].counted, true);
});

console.log('\n--- F2: which entitlements a cancelled invoice revokes ---');

const application = (overrides) => ({
  invoice: INVOICE,
  status: 'Pending',
  schemeCode: 'SCH-1',
  rewardType: 'points',
  ...overrides
});

check('pending and partially-given entitlements are revoked', () => {
  const { toRevoke } = planApplicationRevocations([
    application({ status: 'Pending' }),
    application({ status: 'Partially Given' })
  ], { invoiceId: INVOICE });
  assert.equal(toRevoke.length, 2);
});

check('an already-GIVEN reward is never clawed back silently', () => {
  const { toRevoke, needsReview } = planApplicationRevocations([
    application({ status: 'Given' })
  ], { invoiceId: INVOICE });
  assert.equal(toRevoke.length, 0, 'must not auto-revoke a handed-over reward');
  assert.equal(needsReview.length, 1, 'must be reported for manual review');
});

check('already revoked/rejected records are left alone', () => {
  const { toRevoke, untouched } = planApplicationRevocations([
    application({ status: 'Revoked' }),
    application({ status: 'Rejected' })
  ], { invoiceId: INVOICE });
  assert.equal(toRevoke.length, 0);
  assert.equal(untouched.length, 2);
});

check('entitlements from other invoices are untouched', () => {
  const { toRevoke, untouched } = planApplicationRevocations([
    application({ invoice: OTHER_INVOICE, status: 'Pending' })
  ], { invoiceId: INVOICE });
  assert.equal(toRevoke.length, 0);
  assert.equal(untouched.length, 1);
});

check('a mixed invoice splits into revoke / review correctly', () => {
  const { toRevoke, needsReview } = planApplicationRevocations([
    application({ status: 'Pending' }),
    application({ status: 'Given' }),
    application({ invoice: OTHER_INVOICE, status: 'Pending' })
  ], { invoiceId: INVOICE });
  assert.equal(toRevoke.length, 1);
  assert.equal(needsReview.length, 1);
});

console.log('\n--- F2: flagging the frozen achievements ---');

const achievement = (documentId, slabSeq) => ({
  crossedByDocumentId: documentId,
  crossedByDocumentType: 'DealerInvoice',
  slabSeq,
  revocationPending: false
});

check('only achievements crossed by this invoice are flagged', () => {
  const { achievements, marked } = markAchievementsPendingRevocation([
    achievement(INVOICE, 2),
    achievement(OTHER_INVOICE, 2)
  ], { invoiceId: INVOICE });
  assert.equal(marked, 1);
  assert.equal(achievements[0].revocationPending, true);
  assert.equal(achievements[1].revocationPending, false);
});

check('flagging is idempotent', () => {
  const first = markAchievementsPendingRevocation([achievement(INVOICE, 2)], { invoiceId: INVOICE });
  const second = markAchievementsPendingRevocation(first.achievements, { invoiceId: INVOICE });
  assert.equal(second.marked, 0);
});

console.log('\n--- the two flows, end to end (in-memory) ---');

check('F1 cumulative: cancelling an order removes it from the running total', () => {
  // Dealer has 6 pcs from an earlier order; this order adds 4 -> slab at 10.
  let bucket = {
    contributions: [contribution(OTHER_ORDER, 'SalesOrder', 6), contribution(ORDER, 'SalesOrder', 4)]
  };
  assert.equal(recompute(bucket.contributions).measuredQuantity, 10, 'crosses the 10 slab');

  bucket.contributions = releaseDocumentContributionsInList(bucket.contributions, {
    documentId: ORDER, documentType: 'SalesOrder'
  }).contributions;

  assert.equal(recompute(bucket.contributions).measuredQuantity, 6, 'no longer crosses 10');
});

check('F2 cumulative: cancelling the invoice keeps the ORDER\'s goods counted', () => {
  // At approval the order's rows carry the goods; the invoice's are not added.
  const bucket = {
    contributions: [contribution(ORDER, 'SalesOrder', 4)]
  };
  const { contributions } = releaseDocumentContributionsInList(bucket.contributions, {
    documentId: INVOICE, documentType: 'DealerInvoice'
  });
  assert.equal(recompute(contributions).measuredQuantity, 4, 'order goods must survive');
});

check('F2 perInvoice: cancelling the invoice removes its own rows', () => {
  const bucket = { contributions: [contribution(INVOICE, 'DealerInvoice', 4)] };
  const { contributions, released } = releaseDocumentContributionsInList(bucket.contributions, {
    documentId: INVOICE, documentType: 'DealerInvoice'
  });
  assert.equal(released, 1);
  assert.equal(recompute(contributions).measuredQuantity, 0);
});

console.log('\n--- the controllers actually call the reversal ---');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER_SRC = fs.readFileSync(path.join(ROOT, 'controllers', 'salesOrderController.js'), 'utf8');
const INVOICE_SRC = fs.readFileSync(path.join(ROOT, 'controllers', 'dealerInvoiceController.js'), 'utf8');

check('cancelling an order calls releaseOrderContributions', () => {
  assert.ok(/schemeEngine\.releaseOrderContributions\(/.test(ORDER_SRC),
    'order cancellation does not release scheme contributions');
});

check('the order release is NOT gated on the previous status', () => {
  // Contributions are recorded at CREATE, so a Pending order cancelled straight
  // away still holds them. Gating on `originalStatus` would miss exactly that case.
  const idx = ORDER_SRC.indexOf('schemeEngine.releaseOrderContributions(');
  assert.notEqual(idx, -1);
  const guard = ORDER_SRC.slice(Math.max(0, idx - 700), idx);
  assert.ok(
    /if \(status === 'Cancelled' \|\| status === 'Rejected'\)/.test(guard),
    'expected a simple status guard before the release'
  );
  assert.equal(
    /stockReservedStatuses/.test(guard.slice(guard.lastIndexOf('if (status'))),
    false,
    'the release must not depend on stockReservedStatuses'
  );
});

check('cancelling an invoice calls revokeInvoiceAchievements', () => {
  assert.ok(/schemeEngine\.revokeInvoiceAchievements\(/.test(INVOICE_SRC),
    'invoice cancellation does not revoke scheme achievements');
});

check('the invoice reversal runs inside the cancellation transaction', () => {
  const idx = INVOICE_SRC.indexOf('schemeEngine.revokeInvoiceAchievements(');
  assert.notEqual(idx, -1);
  const call = INVOICE_SRC.slice(idx, idx + 400);
  assert.ok(/session,/.test(call), 'must pass the transaction session');
});

check('already-given rewards are surfaced, not silently dropped', () => {
  assert.ok(/schemeRewardsNeedingReview/.test(INVOICE_SRC),
    'the response does not report rewards that need manual review');
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
