/**
 * Backfill: rebuild SchemeProgress contributions for existing Sales Orders.
 *
 * WHY THIS IS NEEDED
 * Until 2026-10-08 a Sales Order line carried no brand/category/subcategory, and
 * `lineMatchesScope` compares IDS. So a BRAND-scoped scheme matched nothing on the
 * way in and recorded zero progress — it showed "still in progress" with Measured 0
 * no matter how much the dealer bought. The engine now resolves the product
 * hierarchy from the Product master (`enrichLinesWithProductScope`), which fixes
 * every FUTURE order.
 *
 * Orders saved before that fix have no contributions, so their Measured value
 * stays 0. This script re-runs the (idempotent) recording for them.
 *
 * WHAT IT DOES NOT DO
 * It does not commit achievements or create reward entitlements. Those happen at
 * invoice approval and are a deliberate, separate decision — retroactively
 * minting entitlements for old invoices would be a business call, not a repair.
 *
 * Safe to re-run: `recordOrderContributions` drops this document's previous
 * contributions before adding them, so running twice changes nothing.
 *
 * Run:
 *   node scripts/backfillSchemeProgress.js --dry-run      # preview
 *   node scripts/backfillSchemeProgress.js                # apply
 *   node scripts/backfillSchemeProgress.js --company=jain-impex
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { schemeApplicationSchema } from '../models/SchemeApplication.js';
import { schemeSchema } from '../models/Scheme.js';
import { schemeProgressSchema } from '../models/SchemeProgress.js';
import { brandSchema } from '../models/Brand.js';
import { categorySchema } from '../models/Category.js';
import { subcategorySchema } from '../models/Subcategory.js';
import schemeEngine from '../services/schemeEngine.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
/**
 * Also freeze the slabs of ALREADY-APPROVED invoices.
 *
 * OFF by default, deliberately: that mints reward entitlements ("we owe the dealer
 * N points"), which is a business decision, not a repair. The progress backfill
 * above is additive and safe; this one creates obligations, so it is opt-in.
 */
const WITH_INVOICES = args.includes('--invoices');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value._id) return value._id.toString();
  return value.toString();
};

const getModels = (dbConnection) => ({
  SalesOrder: dbConnection.models.SalesOrder
    || dbConnection.model('SalesOrder', salesOrderSchema),
  DealerInvoice: dbConnection.models.DealerInvoice
    || dbConnection.model('DealerInvoice', dealerInvoiceSchema),
  SchemeApplication: dbConnection.models.SchemeApplication
    || dbConnection.model('SchemeApplication', schemeApplicationSchema),
  SchemeProgress: dbConnection.models.SchemeProgress
    || dbConnection.model('SchemeProgress', schemeProgressSchema),
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema)
});

/** Exactly the lines the invoice-approval path sends. */
const linesFromInvoice = (invoice) => (invoice.items || []).map((item) => ({
  product: item.product,
  productCode: item.productCode,
  productName: item.productName,
  brandName: item.brand,
  categoryName: item.category,
  subcategoryName: item.subcategory,
  salesType: invoice.salesType || item.salesType,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  amount: item.totalPrice
}));

/**
 * Register the models the scheme loader populates.
 *
 * `loadCandidateSchemes` does `.populate('scope.brand' | 'scope.category' |
 * 'scope.subcategory')`, and mongoose throws
 * `Schema hasn't been registered for model "Brand"` if that model is not on the
 * connection. In the running server some other controller has always registered
 * them already; in a standalone script nothing has, so we must.
 */
const registerPopulateModels = (dbConnection) => {
  const needed = [
    ['Brand', brandSchema],
    ['Category', categorySchema],
    ['Subcategory', subcategorySchema]
  ];
  for (const [name, schema] of needed) {
    if (!dbConnection.models[name]) dbConnection.model(name, schema);
  }
};

/** The lines the engine expects — exactly what the live create path sends. */
const linesFromOrder = (order) => (order.products || []).map((p) => ({
  product: p.product,
  productCode: p.productCode,
  productName: p.productName,
  salesType: order.salesType,
  quantity: p.quantity,
  unitPrice: p.unitPrice,
  amount: p.totalPrice ?? (Number(p.unitPrice || 0) * Number(p.quantity || 0))
}));

async function backfillCompany(company) {
  const dbConnection = await getCompanyConnection(company);
  if (!dbConnection) {
    console.log(`   ⚠️  no connection for ${company} — skipped`);
    return { orders: 0, recorded: 0, skipped: 0 };
  }

  const { SalesOrder, Scheme } = getModels(dbConnection);
  registerPopulateModels(dbConnection);

  const schemes = await Scheme.find({ appliesTo: 'dealer' }).select('schemeCode schemeName status').lean();
  if (schemes.length === 0) {
    console.log('   no schemes — nothing to do');
    return { orders: 0, recorded: 0, skipped: 0 };
  }

  // Only orders that actually carry a scheme selection: those are the ones whose
  // progress is missing. An order that was never opted in records nothing by
  // design, so there is no point re-running it.
  const orders = await SalesOrder.find({
    'appliedSchemes.0': { $exists: true },
    status: { $nin: ['Cancelled', 'Rejected'] }
  })
    .select('orderNumber orderGroupId dealer dealerName salesType products appliedSchemes createdAt')
    .lean();

  console.log(`   ${orders.length} order(s) carry a scheme selection`);

  let recorded = 0;
  let skipped = 0;

  for (const order of orders) {
    const schemeIds = (order.appliedSchemes || []).map((row) => toId(row.schemeId)).filter(Boolean);
    if (schemeIds.length === 0) { skipped += 1; continue; }

    const lines = linesFromOrder(order);
    if (lines.length === 0) { skipped += 1; continue; }

    if (DRY_RUN) {
      console.log(`   · would record ${order.orderNumber} (${lines.length} line(s), ${schemeIds.length} scheme(s))`);
      recorded += 1;
      continue;
    }

    await schemeEngine.recordOrderContributions(dbConnection, {
      dealerId: order.dealer,
      orderId: order._id,
      documentNumber: order.orderNumber,
      orderGroupId: order.orderGroupId || null,
      lines,
      // The order's own selection — the same gate the live path uses, so a scheme
      // the salesman did not tick is still not counted.
      schemeIds
    });
    recorded += 1;
  }

  return { orders: orders.length, recorded, skipped };
}

/**
 * Freeze the slabs of invoices that were approved while the recording was broken.
 *
 * Idempotent: `commitInvoiceAchievements` upgrades in place and never duplicates,
 * so re-running is safe. Only invoices that carry a scheme selection are touched —
 * the same gate the live approval path uses.
 */
async function backfillInvoices(company) {
  const dbConnection = await getCompanyConnection(company);
  if (!dbConnection) return { invoices: 0, committed: 0 };

  const { DealerInvoice } = getModels(dbConnection);
  registerPopulateModels(dbConnection);

  const invoices = await DealerInvoice.find({
    status: 'Approved',
    isDraft: false,
    'appliedSchemes.0': { $exists: true }
  })
    .select('invoiceNumber invoiceDate creditDays salesType items dealer appliedSchemes salesOrder region regionName totalAmount')
    .lean();

  console.log(`   ${invoices.length} approved invoice(s) carry a scheme selection`);

  const { SchemeApplication, SchemeProgress } = getModels(dbConnection);

  let committed = 0;
  let createdEntitlements = 0;
  let skippedEntitlements = 0;
  for (const invoice of invoices) {
    const schemeIds = (invoice.appliedSchemes || []).map((row) => toId(row.schemeId)).filter(Boolean);
    const lines = linesFromInvoice(invoice);
    if (schemeIds.length === 0 || lines.length === 0) continue;

    if (DRY_RUN) {
      console.log(`   · would commit ${invoice.invoiceNumber} (${lines.length} line(s), ${schemeIds.length} scheme(s))`);
      committed += 1;
      continue;
    }

    const frozen = await schemeEngine.commitInvoiceAchievements(dbConnection, {
      dealerId: invoice.dealer,
      invoiceId: invoice._id,
      documentNumber: invoice.invoiceNumber,
      lines,
      at: invoice.invoiceDate || new Date(),
      creditDays: invoice.creditDays ?? null,
      // Supersede the sales order's contributions — a cumulative scheme must not
      // count the same goods twice.
      salesOrderId: invoice.salesOrder || null,
      schemeIds
    });

    if (frozen.length > 0) {
      console.log(`   · ${invoice.invoiceNumber}: ${frozen.map((f) => `${f.schemeCode} slab ${f.slabSeq} (${f.rewardType})`).join(', ')}`);
    }

    // The engine only FREEZES the achievement; the controller is what turns it
    // into the pending entitlement the Rewards tab lists. A backfill that stopped
    // at the engine would leave the reward invisible.
    //
    // Driven off the BUCKET, not off `frozen`: when the achievement already exists
    // the engine deliberately returns `entitlement: null` (it will not re-issue a
    // reward), so a second run would never create an entitlement the first run
    // missed.
    const buckets = await SchemeProgress.find({
      dealer: invoice.dealer,
      scheme: { $in: frozen.map((f) => f.schemeId) }
    }).lean();

    for (const bucket of buckets) {
      for (const ach of (bucket.achievements || [])) {
        if (ach.revocationPending) continue;   // queued for revocation
        if (ach.redeemed) continue;            // already handed over
        if (ach.autoApplied) continue;         // given automatically at approval

        const already = await SchemeApplication.findOne({
          invoice: invoice._id,
          scheme: bucket.scheme,
          slabSeq: ach.slabSeq,
          product: ach.product || null
        });
        if (already) { skippedEntitlements += 1; continue; }

        // A ONE-TIME offer must not mint a second reward. Entitlements are created
        // per invoice, so without this a second approved invoice on the same slab
        // would hand the dealer the reward twice.
        if (!bucket.allowRepeat) {
          const alreadyIssued = await SchemeApplication.findOne({
            scheme: bucket.scheme,
            dealer: invoice.dealer,
            slabSeq: ach.slabSeq,
            product: ach.product || null,
            status: { $nin: ['Rejected', 'Revoked'] }
          });
          if (alreadyIssued) { skippedEntitlements += 1; continue; }
        }

        const snapshot = ach.rewardSnapshot || {};
        try {
          await SchemeApplication.create({
            scheme: bucket.scheme,
            schemeCode: bucket.schemeCode,
            schemeName: bucket.schemeName || '',
            dealer: invoice.dealer,
            dealerName: bucket.dealerName || '',
            dealerCode: bucket.dealerCode || '',
            region: invoice.region || null,
            regionName: invoice.regionName || '',
            progress: bucket._id,
            slabSeq: ach.slabSeq,
            slabLabel: ach.slabLabel || '',
            product: ach.product || null,
            ladderLabel: ach.ladderLabel || '',
            measuredValue: ach.measuredValue,
            basis: bucket.basis,
            detectedReward: snapshot,
            rewardType: ach.rewardType,
            rewardPoints: Number(snapshot.points || 0),
            rewardPercentage: Number(snapshot.percentage || 0),
            rewardAmount: Number(snapshot.amount || 0),
            rewardFreeItemQuantity: Number(snapshot.freeItemQuantity || 0),
            rewardFreeItemRule: snapshot.freeItemRule || '',
            rewardGiftName: snapshot.giftName || '',
            rewardDescription: snapshot.description || '',
            status: 'Pending',
            sourceDocuments: [{
              documentType: 'DealerInvoice',
              documentId: invoice._id,
              documentNumber: invoice.invoiceNumber,
              amount: invoice.totalAmount,
              occurredAt: invoice.invoiceDate || new Date()
            }],
            invoice: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            salesOrder: invoice.salesOrder || null,
            editHistory: [{
              action: 'created',
              note: `Backfilled from approved invoice ${invoice.invoiceNumber}.`,
              performedAt: new Date()
            }]
          });
          createdEntitlements += 1;
        } catch (error) {
          console.error(`   ⚠️  could not create entitlement for ${invoice.invoiceNumber}:`, error.message);
        }
      }
    }

    // An achievement's measuredValue is a freeze-time snapshot. After a repair it
    // can still describe the old, wrong bucket (e.g. the doubled 14), so sync the
    // ones still owed a reward to what the dealer actually reached.
    for (const bucket of buckets) {
      let touched = false;
      const current = bucket.basis === 'amount'
        ? Number(bucket.measuredAmount || 0)
        : Number(bucket.measuredQuantity || 0);
      for (const ach of (bucket.achievements || [])) {
        if (ach.revocationPending || ach.redeemed) continue;
        if (Number(ach.measuredValue) === current) continue;
        ach.measuredValue = current;
        touched = true;
      }
      if (touched) {
        await SchemeProgress.updateOne({ _id: bucket._id }, { $set: { achievements: bucket.achievements } });
      }
      // Keep the still-pending entitlement's snapshot honest as well — it is what
      // the Rewards drawer shows next to the reward.
      for (const ach of (bucket.achievements || [])) {
        if (ach.revocationPending || ach.redeemed) continue;
        await SchemeApplication.updateMany(
          {
            scheme: bucket.scheme,
            dealer: bucket.dealer,
            slabSeq: ach.slabSeq,
            product: ach.product || null,
            status: 'Pending'
          },
          { $set: { measuredValue: current } }
        );
      }
    }

    committed += 1;
  }

  console.log(`   🎁 ${createdEntitlements} pending entitlement(s) created, ${skippedEntitlements} already existed`);
  return { invoices: invoices.length, committed, createdEntitlements };
}

async function main() {
  console.log('\n🔧 Backfill SchemeProgress contributions from Sales Orders');
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will write)'}`);
  if (WITH_INVOICES) console.log('   Invoices: ON — will also freeze rewards on approved invoices');

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  let totalRecorded = 0;

  for (const company of companies) {
    console.log(`\n━━━ Company: ${company} ━━━`);
    try {
      const result = await backfillCompany(company);
      totalRecorded += result.recorded;
      console.log(`   ✅ ${result.recorded} order(s) processed, ${result.skipped} skipped`);

      if (WITH_INVOICES) {
        console.log('\n   ── approved invoices ──');
        const invResult = await backfillInvoices(company);
        console.log(`   ✅ ${invResult.committed} invoice(s) processed`);
      }
    } catch (error) {
      console.error(`   ❌ ${company} failed:`, error.message);
    }
  }

  console.log(`\n${DRY_RUN ? '🔍 Would process' : '✅ Processed'} ${totalRecorded} order(s) in total.`);
  if (DRY_RUN) console.log('   Re-run without --dry-run to apply.\n');
  else console.log('   Open Schemes & Rewards → Progress to see the rebuilt totals.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
