/**
 * Per-product ladders (spec item #3) must actually PAY OUT.
 *
 * Regression origin: `commitInvoiceAchievements` only ever committed `entry.slab`
 * — the scheme's flat ladder. Per-product ladders were evaluated for the Sales
 * Order preview (so they showed as "Eligible / 2 free items") but never frozen
 * into an achievement, so the reward never reached Schemes & Rewards -> Rewards.
 * A scheme configured the natural way for item 3 (flat ladder left at a single
 * zero tier, real tiers on each product) paid NOTHING.
 *
 * This drives the REAL `commitInvoiceAchievements` against a stubbed connection
 * and a fake bucket, so it exercises the shipping code path rather than a mirror
 * of it.
 *
 * Run: node services/__perProductCommit.test.mjs
 */
import assert from 'node:assert';

import { commitInvoiceAchievements } from './schemeEngine.js';

let passed = 0;
let failed = 0;
const failures = [];

const section = (name) => console.log(`\n${name}`);
const eq = (label, actual, expected) => {
  try {
    assert.deepStrictEqual(actual, expected);
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL ${label}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`);
  }
};
const check = (label, actual) => eq(label, Boolean(actual), true);

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------
const chainable = (rows) => {
  const node = {
    populate: () => node,
    session: () => node,
    // `select` is needed by enrichLinesWithProductScope.
    select: () => node,
    sort: () => node,
    skip: () => node,
    limit: () => node,
    lean: async () => rows
  };
  return node;
};

/** A stand-in for one SchemeProgress document. */
const makeBucket = () => ({
  contributions: [],
  achievements: [],
  saved: 0,
  recomputeTotals() {
    this.measuredQuantity = this.contributions
      .filter((c) => c.counted)
      .reduce((sum, c) => sum + Number(c.quantity || 0), 0);
    this.measuredAmount = this.contributions
      .filter((c) => c.counted)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  },
  refreshNextSlab() { this.nextSlabRefreshed = true; },
  async save() { this.saved += 1; }
});

const stubConnection = ({ schemes, dealer, bucket }) => ({
  models: {
    Dealer: { findById: () => chainable(dealer) },
    Scheme: { find: () => chainable(schemes) },
    SchemeProgress: {
      // `loadBankedProgress` reads the bucket back through find(). Returning []
      // would make a cumulative commit see zero banked progress and skip the
      // slab entirely, so mirror the bucket when it knows which scheme it is.
      find: () => chainable(
        bucket && bucket.scheme && (bucket.contributions || []).length > 0
          ? [{
            scheme: bucket.scheme,
            basis: bucket.basis || 'quantity',
            measuredQuantity: bucket.measuredQuantity,
            measuredAmount: bucket.measuredAmount,
            // retireSupersededOrderContributions reads these.
            contributions: bucket.contributions
          }]
          : []
      ),
      findOne: async () => null,
      findOneAndUpdate: async () => bucket,
      // Used by retireSupersededOrderContributions — must actually apply the
      // update, otherwise the test would pass against a no-op.
      updateOne: async (filter, update) => {
        if (bucket && update && update.$set) Object.assign(bucket, update.$set);
        return { acknowledged: true };
      }
    },
    // Present so getSchemeModels() never falls through to dbConnection.model().
    SchemeApplication: {},
    Product: { find: () => chainable([]) }
  },
  model: () => { throw new Error('stub must not create a model'); }
});

const DEALER = { _id: 'dealer-1', name: 'Sharma Traders', code: 'D-001' };
const AT = new Date('2026-06-15T00:00:00.000Z');

const slab = (seq, from, to, reward) => ({ seq, from, to, reward });
const free = (qty) => ({ type: 'freeItem', freeItemQuantity: qty, freeItemRule: 'sameProduct' });
const pts = (points) => ({ type: 'points', points });

/**
 * Item #3 configured the natural way: the required flat ladder is a single
 * zero-reward tier, and the real tiers live on each product.
 */
const perProductScheme = {
  _id: 'scheme-perproduct',
  schemeCode: 'PP-1',
  schemeName: 'Product-wise quantity',
  appliesTo: 'dealer',
  status: 'Active',
  redemptionMode: 'manual',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  validTo: new Date('2026-12-31T00:00:00.000Z'),
  scope: { level: 'all' },
  dealerScope: {},
  condition: { basis: 'quantity', accumulation: 'perInvoice' },
  slabs: [slab(1, 0, null, pts(0))],
  productSlabs: [
    {
      product: 'A',
      label: 'Pipe ladder',
      slabs: [slab(1, 0, 4, free(0)), slab(2, 5, 9, free(1)), slab(3, 10, null, free(2))]
    },
    {
      product: 'B',
      label: 'Fitting ladder',
      slabs: [slab(1, 0, 9, free(0)), slab(2, 10, 19, free(1)), slab(3, 20, null, free(3))]
    }
  ]
};

const line = (productId, quantity) => ({ productId, quantity, unitPrice: 100 });

// ===========================================================================
section('A per-product-only scheme NOW pays out (it used to pay nothing)');
// ===========================================================================
{
  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket }),
    { dealerId: 'dealer-1', invoiceId: 'inv-1', documentNumber: 'INV-1',
      lines: [line('A', 5), line('B', 10)], at: AT }
  );

  eq('two achievements were frozen (one per product)', frozen.length, 2);
  check('the bucket was persisted', bucket.saved === 1);
  eq('the bucket holds two achievement rows', bucket.achievements.length, 2);

  const a = frozen.find((f) => f.product === 'A');
  const b = frozen.find((f) => f.product === 'B');
  check('Product A produced an achievement', a);
  check('Product B produced an achievement', b);

  eq('A: slab seq 2 (5-9 -> 1 free)', a.slabSeq, 2);
  eq('A: reward is 1 free item', a.rewardSnapshot.freeItemQuantity, 1);
  eq('A: measured 5', a.measuredValue, 5);
  eq('A: carries the ladder label', a.ladderLabel, 'Pipe ladder');

  eq('B: slab seq 2 (10-19 -> 1 free)', b.slabSeq, 2);
  eq('B: reward is 1 free item', b.rewardSnapshot.freeItemQuantity, 1);
  eq('B: measured 10', b.measuredValue, 10);

  // Both products sit at slabSeq 2 — which is exactly why the entitlement dedupe
  // key had to gain `product`. Keyed on {invoice, scheme, slabSeq} alone, the
  // second reward would have been silently skipped.
  eq('both ladders are at the SAME slabSeq', a.slabSeq === b.slabSeq, true);
  eq('...yet they are two distinct rewards', new Set(frozen.map((f) => f.product)).size, 2);
  eq('the flat ladder contributed nothing (its tier pays 0)', frozen.some((f) => !f.product), false);

  // Manual redemption -> the reward is pending, awaiting release.
  check('manual rewards stay pending', a.entitlement !== null);
  eq('...and are not auto-applied', a.autoApplied, false);
}

// ===========================================================================
section('Higher tiers resolve independently per product');
// ===========================================================================
{
  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket }),
    { dealerId: 'dealer-1', invoiceId: 'inv-2', lines: [line('A', 10), line('B', 20)], at: AT }
  );

  const a = frozen.find((f) => f.product === 'A');
  const b = frozen.find((f) => f.product === 'B');
  eq('A reaches slab 3', a.slabSeq, 3);
  eq('A pays 2 free', a.rewardSnapshot.freeItemQuantity, 2);
  eq('B reaches slab 3', b.slabSeq, 3);
  eq('B pays 3 free', b.rewardSnapshot.freeItemQuantity, 3);
}

// ===========================================================================
section('A product that was NOT bought earns nothing');
// ===========================================================================
{
  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket }),
    { dealerId: 'dealer-1', invoiceId: 'inv-3', lines: [line('A', 10)], at: AT }
  );

  eq('only Product A is frozen', frozen.length, 1);
  eq('...and it is Product A', frozen[0].product, 'A');
  eq('the bucket holds one row', bucket.achievements.length, 1);
  eq('no row was created for Product B',
    bucket.achievements.some((row) => row.product === 'B'), false);
}

// ===========================================================================
section('A flat ladder and per-product ladders coexist and upgrade independently');
// ===========================================================================
{
  const combined = {
    ...perProductScheme,
    _id: 'scheme-combined',
    slabs: [slab(1, 0, 99, pts(0)), slab(2, 100, null, pts(500))],
    condition: { basis: 'amount', accumulation: 'perInvoice' }
  };

  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [combined], dealer: DEALER, bucket }),
    {
      dealerId: 'dealer-1', invoiceId: 'inv-4', at: AT,
      lines: [
        { productId: 'A', quantity: 10, unitPrice: 100 },  // ₹1,000 -> A at slab 3
        { productId: 'B', quantity: 10, unitPrice: 100 }   // ₹1,000 -> B at slab 2
      ]
    }
  );

  const flat = frozen.find((f) => f.product === null);
  check('the flat ladder also produced an achievement', flat);
  eq('flat: measured ₹2,000', flat.measuredValue, 2000);
  eq('flat: points reward', flat.rewardSnapshot.points, 500);

  eq('three achievements in total (flat + A + B)', frozen.length, 3);
  eq('the bucket holds three rows', bucket.achievements.length, 3);
  // The flat row must NOT be confused with the product rows.
  eq('exactly one row has a null product',
    bucket.achievements.filter((r) => !r.product).length, 1);
  eq('two rows carry a product',
    bucket.achievements.filter((r) => r.product).length, 2);
}

// ===========================================================================
section('Re-approving the same invoice does not duplicate');
// ===========================================================================
{
  const bucket = makeBucket();
  const conn = stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket });
  const args = {
    dealerId: 'dealer-1', invoiceId: 'inv-5',
    lines: [line('A', 5), line('B', 10)], at: AT
  };

  await commitInvoiceAchievements(conn, args);
  eq('first pass froze 2', bucket.achievements.length, 2);

  await commitInvoiceAchievements(conn, args);
  eq('second pass still 2 rows (idempotent)', bucket.achievements.length, 2);

  const a = bucket.achievements.find((r) => r.product === 'A');
  eq('A was not duplicated', a.slabSeq, 2);
}

// ===========================================================================
section('An upgrade replaces the product row in place, leaving the other alone');
// ===========================================================================
{
  const bucket = makeBucket();
  const conn = stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket });

  await commitInvoiceAchievements(conn, {
    dealerId: 'dealer-1', invoiceId: 'inv-6', lines: [line('A', 5), line('B', 10)], at: AT
  });
  eq('A starts at slab 2', bucket.achievements.find((r) => r.product === 'A').slabSeq, 2);
  eq('B starts at slab 2', bucket.achievements.find((r) => r.product === 'B').slabSeq, 2);

  // A second invoice pushes A to its top tier; B stays where it is.
  await commitInvoiceAchievements(conn, {
    dealerId: 'dealer-1', invoiceId: 'inv-7', lines: [line('A', 10)], at: AT
  });

  const a = bucket.achievements.find((r) => r.product === 'A');
  const b = bucket.achievements.find((r) => r.product === 'B');
  eq('A upgraded to slab 3', a.slabSeq, 3);
  eq('A now pays 2 free', a.rewardSnapshot.freeItemQuantity, 2);
  eq('B is untouched at slab 2', b.slabSeq, 2);
  eq('still exactly two rows — no contradiction', bucket.achievements.length, 2);
}

// ===========================================================================
section('autoAtInvoice hands the per-product reward over immediately');
// ===========================================================================
{
  const auto = { ...perProductScheme, _id: 'scheme-auto', redemptionMode: 'autoAtInvoice' };
  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [auto], dealer: DEALER, bucket }),
    { dealerId: 'dealer-1', invoiceId: 'inv-8', lines: [line('A', 5)], at: AT }
  );

  eq('one achievement', frozen.length, 1);
  eq('it is marked auto-applied', frozen[0].autoApplied, true);
  eq('so there is no pending entitlement', frozen[0].entitlement, null);
  eq('the stored row is redeemed', bucket.achievements[0].redeemed, true);
}

// ===========================================================================
section('The opt-in gate still applies to per-product ladders');
// ===========================================================================
{
  const bucket = makeBucket();
  const frozen = await commitInvoiceAchievements(
    stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket }),
    { dealerId: 'dealer-1', invoiceId: 'inv-9', lines: [line('A', 5)], at: AT,
      schemeIds: [] }
  );
  eq('an empty selection freezes nothing', frozen.length, 0);
  eq('...and writes no rows', bucket.achievements.length, 0);

  const bucket2 = makeBucket();
  const frozen2 = await commitInvoiceAchievements(
    stubConnection({ schemes: [perProductScheme], dealer: DEALER, bucket: bucket2 }),
    { dealerId: 'dealer-1', invoiceId: 'inv-10', lines: [line('A', 5)], at: AT,
      schemeIds: ['scheme-perproduct'] }
  );
  eq('a selected scheme passes the gate', frozen2.length, 1);
}

// ===========================================================================
section('CUMULATIVE: an invoice supersedes its order (no double counting)');
// ===========================================================================
{
  const { recordOrderContributions } = await import('./schemeEngine.js');

  const cumulative = {
    _id: 'sch-cum', schemeCode: 'OCT-01', schemeName: 'Buy 5 get 50',
    appliesTo: 'dealer', status: 'Active', redemptionMode: 'manual', allowRepeat: false,
    validFrom: new Date('2026-10-08T00:00:00.000Z'), validTo: new Date('2026-11-07T00:00:00.000Z'),
    scope: { level: 'all' }, dealerScope: {},
    condition: { basis: 'quantity', accumulation: 'cumulative' },
    slabs: [{ seq: 1, from: 5, to: null, reward: pts(50) }],
    productSlabs: []
  };

  const bucket = makeBucket();
  // Let the stub report this bucket back as banked progress.
  bucket.scheme = 'sch-cum';
  bucket.basis = 'quantity';
  const conn = stubConnection({ schemes: [cumulative], dealer: DEALER, bucket });
  const line = (qty) => ({ productId: 'p1', quantity: qty, unitPrice: 100 });
  // INSIDE the scheme's Oct-08 → Nov-07 window. Using the file's June AT would
  // make schemeIsLive() reject it and record nothing.
  const AT_IN_WINDOW = new Date('2026-10-08T12:00:00.000Z');

  // The dealer orders 3 pcs.
  await recordOrderContributions(conn, {
    dealerId: 'dealer-1', orderId: 'ord-1', documentNumber: 'SO-1',
    lines: [line(3)], at: AT_IN_WINDOW, schemeIds: ['sch-cum']
  });
  eq('the order records 3', bucket.measuredQuantity, 3);

  // The invoice for that order is approved with the SAME 3 pcs.
  await commitInvoiceAchievements(conn, {
    dealerId: 'dealer-1', invoiceId: 'inv-1', documentNumber: 'INV-1',
    lines: [line(3)], at: AT_IN_WINDOW, schemeIds: ['sch-cum'],
    salesOrderId: 'ord-1'
  });

  eq('still 3 — NOT 6', bucket.measuredQuantity, 3);
  // For a cumulative scheme the ORDER is the running total, so its row stays
  // counted. The invoice's row is simply not added — that is what prevents the
  // doubling, and it keeps the bucket's history truthful.
  eq('the order row stays counted',
    bucket.contributions.filter((c) => c.documentType === 'SalesOrder' && c.counted !== false).length, 1);
  eq('the invoice row is NOT added',
    bucket.contributions.filter((c) => c.documentType === 'DealerInvoice').length, 0);
  eq('and the slab was NOT crossed at a doubled 6', bucket.achievements.length, 0);

  // A second invoice for a DIFFERENT order keeps adding.
  await commitInvoiceAchievements(conn, {
    dealerId: 'dealer-1', invoiceId: 'inv-2', documentNumber: 'INV-2',
    lines: [line(3)], at: AT_IN_WINDOW, schemeIds: ['sch-cum'],
    salesOrderId: null
  });
  eq('an invoice with no order simply adds: 3 + 3 = 6', bucket.measuredQuantity, 6);
  eq('now the 5-slab is crossed', bucket.achievements.length, 1);
  eq('with the 50-point reward', bucket.achievements[0].rewardSnapshot.points, 50);
}

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailed assertions:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
