/**
 * Brand / category / subcategory scoped schemes must actually record progress.
 *
 * THE BUG THIS PINS
 * A scheme scoped to a brand matched nothing on the way in, so it sat at
 * "still in progress" with Measured 0 however much the dealer bought — while the
 * Sales Order screen happily showed it as eligible (the browser DOES send
 * brandId) and the order badge showed it as applied.
 *
 * Neither source document carries the ids:
 *   - a Sales Order line stores only `product`, `productCode`, `productName`;
 *   - a Dealer Invoice line stores the brand as a NAME string.
 * `lineMatchesScope` compares IDS, so the match always failed.
 *
 * A `product`-scoped scheme was unaffected (the product id IS on the line), which
 * is why this stayed hidden.
 *
 * Run: node services/__lineEnrichment.test.mjs
 */
import assert from 'node:assert';

import {
  enrichLinesWithProductScope,
  recordOrderContributions,
  evaluateSchemes,
  normalizeLine
} from './schemeEngine.js';

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
    sort: () => node,
    select: () => node,
    skip: () => node,
    limit: () => node,
    lean: async () => rows
  };
  return node;
};

const newBucket = (dealer, scheme) => ({
  dealer,
  scheme,
  contributions: [],
  achievements: [],
  measuredQuantity: 0,
  measuredAmount: 0,
  recomputeTotals() {
    const counted = this.contributions.filter((c) => c.counted !== false);
    this.measuredQuantity = counted.reduce((s, c) => s + Number(c.quantity || 0), 0);
    this.measuredAmount = counted.reduce((s, c) => s + Number(c.amount || 0), 0);
  },
  refreshNextSlab() {},
  async save() {}
});

const BRAND_ID = 'brand-test';
const CAT_ID = 'cat-1';
const SUB_ID = 'sub-1';

const makeConn = ({ schemes, dealer, products, buckets = [] }) => {
  const calls = { productFind: 0 };
  const conn = {
    models: {
      Dealer: { findById: () => chainable(dealer) },
      Scheme: { find: () => chainable(schemes) },
      Product: {
        find: () => { calls.productFind += 1; return chainable(products); }
      },
      SchemeProgress: {
        find: () => chainable(buckets),
        findOne: async () => null,
        findOneAndUpdate: async (q) => {
          let b = buckets.find((x) => String(x.dealer) === String(q.dealer) && String(x.scheme) === String(q.scheme));
          if (!b) { b = newBucket(q.dealer, q.scheme); buckets.push(b); }
          return b;
        }
      },
      SchemeApplication: {}
    },
    model: () => { throw new Error('stub must not create a model'); }
  };
  return { conn, calls, buckets };
};

const DEALER = { _id: 'dealer-1', name: 'Ravi Roy', code: 'D-001' };
const AT = new Date('2026-10-08T10:00:00Z');

/** Exactly what a Sales Order line looks like: product id, no brand at all. */
const orderLine = (qty) => ({ product: 'prod-1', productCode: 'TTT004', productName: 'new product test', quantity: qty, unitPrice: 100 });

const PRODUCTS = [{ _id: 'prod-1', brand: BRAND_ID, category: CAT_ID, subcategory: SUB_ID, itemName: 'new product test', productCode: 'TTT004' }];

/** The user's scheme: brand-scoped, quantity, cumulative, 5 and above -> 50 points. */
const brandScheme = {
  _id: 'sch-oct01',
  schemeCode: 'OCT-01',
  schemeName: 'Buy 5 get 50',
  appliesTo: 'dealer',
  status: 'Active',
  redemptionMode: 'manual',
  validFrom: new Date('2026-10-08T00:00:00Z'),
  validTo: new Date('2026-11-07T00:00:00Z'),
  scope: { level: 'brand', brand: BRAND_ID },
  dealerScope: {},
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  slabs: [
    { seq: 1, from: 0, to: 4, reward: { type: 'points', points: 0 } },
    { seq: 2, from: 5, to: null, reward: { type: 'points', points: 50 } }
  ],
  productSlabs: []
};

// ===========================================================================
section('enrichLinesWithProductScope');
// ===========================================================================
{
  const { conn, calls } = makeConn({ schemes: [], dealer: DEALER, products: PRODUCTS });
  const out = await enrichLinesWithProductScope(conn, [orderLine(3)]);
  eq('brandId is filled from the Product master', out[0].brandId, BRAND_ID);
  eq('categoryId too', out[0].categoryId, CAT_ID);
  eq('subcategoryId too', out[0].subcategoryId, SUB_ID);
  eq('the quantity is untouched', out[0].quantity, 3);
  eq('one lookup for the whole document', calls.productFind, 1);

  // The normalised shape is what the matcher actually reads.
  const n = normalizeLine(out[0]);
  eq('the matcher now sees a brand id', n.brandId, BRAND_ID);
}
{
  const { conn, calls } = makeConn({ schemes: [], dealer: DEALER, products: PRODUCTS });
  const already = [{ productId: 'prod-1', brandId: BRAND_ID, categoryId: CAT_ID, subcategoryId: SUB_ID, quantity: 3 }];
  const out = await enrichLinesWithProductScope(conn, already);
  eq('lines that already carry the ids are returned untouched', out, already);
  eq('...and no Product query is made', calls.productFind, 0);
}
{
  const { conn } = makeConn({ schemes: [], dealer: DEALER, products: [] });
  const lines = [orderLine(3)];
  const out = await enrichLinesWithProductScope(conn, lines);
  eq('an unknown product passes through untouched', out[0], lines[0]);
}
{
  const { conn } = makeConn({ schemes: [], dealer: DEALER, products: PRODUCTS });
  eq('an empty list is a no-op', await enrichLinesWithProductScope(conn, []), []);
  eq('a non-array is a no-op', await enrichLinesWithProductScope(conn, undefined), []);
}
{
  // A failing lookup must NOT take every scheme's progress down with it — a
  // scope-less scheme does not need the hierarchy at all.
  const broken = {
    models: { Product: { find: () => { throw new Error('boom'); } } },
    model: () => { throw new Error('no model'); }
  };
  const lines = [orderLine(3)];
  const out = await enrichLinesWithProductScope(broken, lines);
  eq('a failing Product lookup returns the lines unchanged', out, lines);
}

// ===========================================================================
section('THE BUG — a brand-scoped scheme now records progress');
// ===========================================================================
{
  const { conn, buckets } = makeConn({ schemes: [brandScheme], dealer: DEALER, products: PRODUCTS });

  await recordOrderContributions(conn, {
    dealerId: 'dealer-1',
    orderId: 'ord-1',
    documentNumber: 'SO-2026-0017',
    lines: [orderLine(3)],
    at: AT,
    schemeIds: ['sch-oct01']
  });

  eq('a bucket was created', buckets.length, 1);
  eq('it holds one contribution', buckets[0].contributions.length, 1);
  eq('the measured quantity is 3 (was 0 before the fix)', buckets[0].measuredQuantity, 3);
  eq('the contribution remembers the brand NAME for display', buckets[0].contributions[0].brand, '');

  // The second order takes the dealer over the line.
  await recordOrderContributions(conn, {
    dealerId: 'dealer-1',
    orderId: 'ord-2',
    documentNumber: 'SO-2026-0019',
    lines: [orderLine(4)],
    at: AT,
    schemeIds: ['sch-oct01']
  });

  eq('3 + 4 = 7 accumulated across both orders', buckets[0].measuredQuantity, 7);
  eq('still one bucket', buckets.length, 1);
}

// ===========================================================================
section('...and without the enrichment it really did record nothing');
// ===========================================================================
{
  // Call the pure matcher directly with the RAW order line, i.e. the old shape.
  const evaluated = evaluateSchemes({
    schemes: [brandScheme],
    dealer: DEALER,
    lines: [orderLine(7)],
    at: AT
  });
  eq('the old shape matched no scheme at all', evaluated.length, 0);

  // With the enriched shape it matches.
  const enriched = await enrichLinesWithProductScope(
    makeConn({ schemes: [], dealer: DEALER, products: PRODUCTS }).conn,
    [orderLine(7)]
  );
  const after = evaluateSchemes({ schemes: [brandScheme], dealer: DEALER, lines: enriched, at: AT });
  eq('the enriched shape matches', after.length, 1);
  eq('and it is eligible at 7 pcs', after[0].eligible, true);
  eq('with the 50-point reward', after[0].slab.reward.points, 50);
}

// ===========================================================================
section('a category- and subcategory-scoped scheme benefits too');
// ===========================================================================
for (const [level, id, label] of [['category', CAT_ID, 'category'], ['subcategory', SUB_ID, 'subcategory']]) {
  const scheme = { ...brandScheme, _id: `sch-${level}`, scope: { level, [level]: id } };
  const { conn, buckets } = makeConn({ schemes: [scheme], dealer: DEALER, products: PRODUCTS });
  await recordOrderContributions(conn, {
    dealerId: 'dealer-1', orderId: 'ord-x', documentNumber: 'SO-X',
    lines: [orderLine(5)], at: AT, schemeIds: [scheme._id]
  });
  eq(`a ${label}-scoped scheme records progress`, buckets[0]?.measuredQuantity, 5);
}

// ===========================================================================
section('a product of ANOTHER brand still does not count');
// ===========================================================================
{
  const otherProducts = [{ _id: 'prod-1', brand: 'brand-OTHER', category: CAT_ID, subcategory: SUB_ID, itemName: 'x', productCode: 'X' }];
  const { conn, buckets } = makeConn({ schemes: [brandScheme], dealer: DEALER, products: otherProducts });
  await recordOrderContributions(conn, {
    dealerId: 'dealer-1', orderId: 'ord-y', documentNumber: 'SO-Y',
    lines: [orderLine(50)], at: AT, schemeIds: ['sch-oct01']
  });
  eq('a different brand records nothing', buckets.length, 0);
}

// ===========================================================================
section('an "all products" scheme was never affected');
// ===========================================================================
{
  const allScheme = { ...brandScheme, _id: 'sch-all', scope: { level: 'all' } };
  const { conn, buckets } = makeConn({ schemes: [allScheme], dealer: DEALER, products: [] });
  await recordOrderContributions(conn, {
    dealerId: 'dealer-1', orderId: 'ord-z', documentNumber: 'SO-Z',
    lines: [orderLine(6)], at: AT, schemeIds: ['sch-all']
  });
  eq('it still records without any product lookup', buckets[0]?.measuredQuantity, 6);
}

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
