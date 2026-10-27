/**
 * Repair: reverse the scheme consequences of documents cancelled BEFORE the
 * cancellation-reversal fix existed.
 *
 * WHY THIS EXISTS
 * Cancelling an order used to leave its scheme contributions counting, and
 * cancelling an invoice used to leave its frozen achievement and reward
 * entitlement in place. The live paths now reverse both, but every document
 * cancelled before that fix is still contributing:
 *
 *   · a CANCELLED / REJECTED Sales Order still counts toward cumulative progress,
 *     so a dealer can be paid a slab they reached on undelivered goods;
 *   · a CANCELLED Dealer Invoice still holds a Pending entitlement, so a reward
 *     is owed for a sale that no longer exists.
 *
 * WHAT IT DOES
 *   1. For every Cancelled/Rejected Sales Order that still has counted
 *      contributions → mark them `counted: false` and recompute the bucket.
 *      Rows are KEPT; only the count changes.
 *   2. For every Cancelled Dealer Invoice with live entitlements → revoke the
 *      Pending / Partially Given ones, flag the achievements it froze, and
 *      release its own per-invoice contributions.
 *   3. Reports — never touches — rewards already marked `Given`. Clawing back a
 *      reward that has physically changed hands is a business decision.
 *
 * Safe to re-run: both operations are idempotent.
 *
 * Run:
 *   node scripts/repairSchemeReversals.mjs --dry-run    # preview (default)
 *   node scripts/repairSchemeReversals.mjs --apply
 *   node scripts/repairSchemeReversals.mjs --apply --company=<company>
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { schemeSchema } from '../models/Scheme.js';
import { schemeProgressSchema } from '../models/SchemeProgress.js';
import { schemeApplicationSchema } from '../models/SchemeApplication.js';
import schemeEngine from '../services/schemeEngine.js';

dotenv.config();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

const getModels = (dbConnection) => ({
  SalesOrder: dbConnection.models.SalesOrder
    || dbConnection.model('SalesOrder', salesOrderSchema),
  DealerInvoice: dbConnection.models.DealerInvoice
    || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema),
  SchemeProgress: dbConnection.models.SchemeProgress
    || dbConnection.model('SchemeProgress', schemeProgressSchema),
  SchemeApplication: dbConnection.models.SchemeApplication
    || dbConnection.model('SchemeApplication', schemeApplicationSchema)
});

async function repairCompany(company) {
  const dbConnection = await getCompanyConnection(company);
  if (!dbConnection) {
    console.log(`   ! no connection for ${company} — skipped`);
    return { orders: 0, orderRows: 0, invoices: 0, revoked: 0, given: 0 };
  }

  const { SalesOrder, DealerInvoice } = getModels(dbConnection);
  const stats = { orders: 0, orderRows: 0, invoices: 0, revoked: 0, given: 0 };

  // ── 1. Cancelled / rejected orders still counting toward progress ──────────
  const cancelledOrders = await SalesOrder.find({
    status: { $in: ['Cancelled', 'Rejected'] }
  }).select('orderNumber dealer status').lean();

  console.log(`   ${cancelledOrders.length} cancelled/rejected order(s) to check`);

  for (const order of cancelledOrders) {
    const buckets = await getModels(dbConnection).SchemeProgress.find({
      dealer: order.dealer,
      'contributions.documentId': order._id
    }).select('contributions scheme').lean();

    const stillCounted = buckets.reduce(
      (sum, bucket) => sum + (bucket.contributions || []).filter(
        (c) => String(c.documentId) === String(order._id)
          && c.documentType === 'SalesOrder'
          && c.counted !== false
      ).length,
      0
    );
    if (stillCounted === 0) continue;

    stats.orders += 1;
    stats.orderRows += stillCounted;

    if (!APPLY) {
      console.log(`   · would release ${stillCounted} contribution(s) on ${order.status.toLowerCase()} order ${order.orderNumber}`);
      continue;
    }

    const result = await schemeEngine.releaseOrderContributions(dbConnection, {
      dealerId: order.dealer,
      orderId: order._id
    });
    console.log(`   + released ${result.released} contribution(s) on ${order.orderNumber}`);
  }

  // ── 2. Cancelled invoices still holding entitlements ───────────────────────
  const cancelledInvoices = await DealerInvoice.find({
    status: 'Cancelled',
    isDraft: false
  }).select('invoiceNumber dealer').lean();

  console.log(`   ${cancelledInvoices.length} cancelled invoice(s) to check`);

  for (const invoice of cancelledInvoices) {
    const applications = await getModels(dbConnection).SchemeApplication.find({
      invoice: invoice._id,
      status: { $nin: ['Revoked', 'Rejected'] }
    }).lean();

    if (applications.length === 0) continue;

    const revocable = applications.filter((a) => a.status !== 'Given');
    const given = applications.filter((a) => a.status === 'Given');

    if (revocable.length === 0 && given.length === 0) continue;

    stats.invoices += 1;
    stats.given += given.length;

    if (!APPLY) {
      console.log(
        `   · would revoke ${revocable.length} entitlement(s) on ${invoice.invoiceNumber}`
        + (given.length > 0 ? ` — ${given.length} already GIVEN, needs manual review` : '')
      );
      continue;
    }

    const result = await schemeEngine.revokeInvoiceAchievements(dbConnection, {
      invoiceId: invoice._id,
      reason: 'Backfill: invoice was cancelled before scheme reversal existed'
    });
    stats.revoked += result.revoked;

    console.log(
      `   + ${invoice.invoiceNumber}: revoked ${result.revoked}, flagged ${result.flagged}`
      + (result.needsReview.length > 0 ? `, ${result.needsReview.length} GIVEN left for review` : '')
    );
  }

  return stats;
}

async function main() {
  console.log('\n=== Repair scheme reversals for previously cancelled documents ===');
  console.log(APPLY ? 'MODE: APPLY (changes will be written)' : 'MODE: DRY RUN (no changes)');

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  if (!companies || companies.length === 0) {
    console.log('No companies found. Check the company configuration.');
    process.exitCode = 1;
    return;
  }

  const totals = { orders: 0, orderRows: 0, invoices: 0, revoked: 0, given: 0 };

  for (const company of companies) {
    console.log(`\n-- ${company}`);
    const stats = await repairCompany(company);
    for (const key of Object.keys(totals)) totals[key] += stats[key];
  }

  console.log('\n=== Summary ===');
  console.log(`cancelled orders still counting : ${totals.orders}`);
  console.log(`order contributions released    : ${totals.orderRows}`);
  console.log(`cancelled invoices with rewards : ${totals.invoices}`);
  console.log(`entitlements revoked            : ${totals.revoked}`);
  console.log(`already-GIVEN (manual review)   : ${totals.given}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write these changes.');
}

main().catch((error) => {
  console.error('\nScript failed:', error);
  process.exitCode = 1;
});
