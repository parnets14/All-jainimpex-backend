/**
 * Repair: remove the dealer-extra discount from Sales Order lines that are
 * covered by a scheme that was applied to that order.
 *
 * WHY THIS EXISTS
 * Dealer extra discount (Dealer Master → extraDiscounts) is a standing
 * commercial term. When a scheme is applied to a document, the scheme is already
 * the concession on the products it covers, so the two must not stack. The live
 * create/reprice paths now zero the dealer-extra stage for scheme-covered lines,
 * but orders written BEFORE that rule still carry it — and an invoice replays the
 * order's stored stages, so those old orders would keep passing the discount on.
 *
 * WHAT IT DOES
 * For every order with a non-empty `appliedSchemes` gate:
 *   · a line whose product falls inside an applied scheme's scope
 *   · and whose `dealerExtraDiscount` is greater than 0
 * gets the dealer-extra stage removed from `discountPolicySnapshot.orderedStages`,
 * `dealerExtraDiscount` set to 0, and the line re-priced with the remaining
 * stages (direct + level discounts are untouched). Order totals are recomputed by
 * the model's own pre-save hook.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * Orders that already have a non-cancelled invoice are SKIPPED and reported.
 * Their invoice has been priced, and possibly approved and posted to the ledger —
 * changing the order underneath it would desynchronise the two documents. Review
 * those manually.
 *
 * Safe to re-run: a line whose dealer extra is already 0 is skipped, so a second
 * run changes nothing.
 *
 * Run:
 *   node scripts/fixDealerExtraOnSchemeOrders.mjs --dry-run     # preview (default)
 *   node scripts/fixDealerExtraOnSchemeOrders.mjs --apply       # write changes
 *   node scripts/fixDealerExtraOnSchemeOrders.mjs --apply --company=<company>
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { schemeSchema } from '../models/Scheme.js';
import { calculateDiscountLine } from '../utils/sequentialDiscountPolicy.js';
import { loadAppliedSchemeScopes, isProductCoveredBySchemes } from '../utils/schemeCoverage.js';

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
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema)
});

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Re-price one line without its dealer-extra stage.
 * Returns null when the line needs no change.
 */
const repriceLine = (line, schemeScopes) => {
  const dealerExtra = Number(line.dealerExtraDiscount || 0);
  if (dealerExtra <= 0) return null;

  // `schemeScopeLine` accepts the stored line shape directly.
  if (!isProductCoveredBySchemes(line, schemeScopes)) return null;

  const snapshot = line.discountPolicySnapshot;
  const orderedStages = Array.isArray(snapshot?.orderedStages) ? snapshot.orderedStages : null;
  if (!orderedStages) {
    // Without the persisted policy we cannot re-price safely. Report, don't guess.
    return { needsManualReview: true, reason: 'no discountPolicySnapshot.orderedStages' };
  }

  const stages = orderedStages
    .filter((stage) => stage.kind !== 'dealer_extra')
    .map((stage) => ({
      key: stage.key,
      kind: stage.kind,
      levelName: stage.levelName || null,
      ratePercentage: Number(stage.ratePercentage || 0)
    }));

  const baseAmount = Number(line.quantity || 0) * Number(line.unitPrice || 0);
  const calculation = calculateDiscountLine({
    baseAmount,
    stages,
    gstPercentage: Number(line.gst || 0),
    masterDiscountCap: snapshot.masterDiscountCap,
    combinedLevelDiscountCap: snapshot.combinedLevelDiscountCap,
    allowedDiscountLevels: line.discountPermissionSnapshot?.allowedDiscountLevels || [],
    enforceLevelPermissions: line.discountPermissionSnapshot?.enforceLevelPermissions ?? true,
    bypassLevelPermission: false
  });

  return {
    stages,
    calculation,
    before: { dealerExtra, totalPrice: Number(line.totalPrice || 0) },
    after: { dealerExtra: 0, totalPrice: money(calculation.finalAmount) }
  };
};

async function fixCompany(company) {
  const dbConnection = await getCompanyConnection(company);
  if (!dbConnection) {
    console.log(`   ! no connection for ${company} — skipped`);
    return { orders: 0, changed: 0, lines: 0, skippedInvoiced: 0, manual: 0 };
  }

  const { SalesOrder, DealerInvoice, Scheme } = getModels(dbConnection);

  const orders = await SalesOrder.find({
    'appliedSchemes.0': { $exists: true },
    status: { $nin: ['Cancelled', 'Rejected'] }
  })
    .select('orderNumber orderDate status salesType products appliedSchemes totalAmount')
    .lean();

  console.log(`   ${orders.length} order(s) carry a scheme selection`);
  if (orders.length === 0) {
    return { orders: 0, changed: 0, lines: 0, skippedInvoiced: 0, manual: 0 };
  }

  const orderIds = orders.map((o) => o._id);
  const invoicedOrderIds = new Set(
    (await DealerInvoice.find({
      salesOrder: { $in: orderIds },
      status: { $ne: 'Cancelled' }
    }).select('salesOrder').lean())
      .map((row) => String(row.salesOrder))
  );

  const stats = { orders: orders.length, changed: 0, lines: 0, skippedInvoiced: 0, manual: 0 };

  for (const order of orders) {
    if (invoicedOrderIds.has(String(order._id))) {
      stats.skippedInvoiced += 1;
      console.log(`   ~ skip ${order.orderNumber} (already invoiced — review manually)`);
      continue;
    }

    const schemeScopes = await loadAppliedSchemeScopes(Scheme, order.appliedSchemes);
    if (schemeScopes.length === 0) continue;

    const patches = [];
    for (const line of order.products || []) {
      const result = repriceLine(line, schemeScopes);
      if (!result) continue;

      if (result.needsManualReview) {
        stats.manual += 1;
        console.log(`   ? ${order.orderNumber} · ${line.productName || line.product}: ${result.reason}`);
        continue;
      }

      patches.push({ line, result });
    }

    if (patches.length === 0) continue;

    stats.changed += 1;
    stats.lines += patches.length;

    if (!APPLY) {
      for (const { line, result } of patches) {
        console.log(
          `   · would fix ${order.orderNumber} · ${line.productName || line.product}: `
          + `dealer extra ${result.before.dealerExtra}% -> 0%, `
          + `line ${result.before.totalPrice} -> ${result.after.totalPrice}`
        );
      }
      continue;
    }

    // Apply against the live documents (the .lean() copies above are for reporting).
    const doc = await SalesOrder.findById(order._id);
    if (!doc) continue;

    for (const { line } of patches) {
      const target = doc.products.id(line._id);
      if (!target) continue;

      const result = repriceLine(target.toObject(), schemeScopes);
      if (!result || result.needsManualReview) continue;

      target.dealerExtraDiscount = 0;
      if (target.discountPolicySnapshot) {
        target.discountPolicySnapshot.dealerExtraDiscountPercentage = 0;
        target.discountPolicySnapshot.orderedStages = result.stages;
      }
      target.discountAmount = result.calculation.discountAmount;
      target.gstAmount = result.calculation.gstAmount;
      target.totalPrice = result.calculation.finalAmount;
      target.dealerExtraDiscountBlockedByScheme = true;
    }

    await doc.save(); // pre-save recomputes order totals from the lines
    console.log(
      `   + fixed ${order.orderNumber}: ${patches.length} line(s), `
      + `order total now ${Number(doc.totalAmount || 0).toFixed(2)}`
    );
  }

  return stats;
}

async function main() {
  console.log(`\n=== Dealer-extra discount on scheme-covered order lines ===`);
  console.log(APPLY ? 'MODE: APPLY (changes will be written)' : 'MODE: DRY RUN (no changes)');

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  if (!companies || companies.length === 0) {
    console.log('No companies found. Check the company configuration.');
    process.exitCode = 1;
    return;
  }

  const totals = { orders: 0, changed: 0, lines: 0, skippedInvoiced: 0, manual: 0 };

  for (const company of companies) {
    console.log(`\n-- ${company}`);
    const stats = await fixCompany(company);
    totals.orders += stats.orders;
    totals.changed += stats.changed;
    totals.lines += stats.lines;
    totals.skippedInvoiced += stats.skippedInvoiced;
    totals.manual += stats.manual;
  }

  console.log('\n=== Summary ===');
  console.log(`orders scanned      : ${totals.orders}`);
  console.log(`orders changed      : ${totals.changed}`);
  console.log(`lines repriced      : ${totals.lines}`);
  console.log(`skipped (invoiced)  : ${totals.skippedInvoiced}`);
  console.log(`need manual review  : ${totals.manual}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write these changes.');
}

main().catch((error) => {
  console.error('\nScript failed:', error);
  process.exitCode = 1;
});
