/**
 * The 13-item specification, verified against the real engine.
 *
 * Every number in here is taken from the specification the client wrote, so this
 * file doubles as executable documentation: if the engine ever stops honouring
 * one of these rules, this test fails with the exact figure that broke.
 *
 * Pure — no DB. Everything goes through the exported engine functions
 * (`evaluateSchemes`, `resolveSlab`, `evaluateMixGroups`, `evaluateProductSlabs`,
 * `resolveFreeItemProduct`), which is the same code the live invoice/order path
 * runs.
 *
 *   node services/__spec13.test.mjs
 */
import assert from 'node:assert';

import {
  evaluateSchemes,
  evaluateMixGroups,
  evaluateProductSlabs,
  resolveSlab,
  resolveFreeItemProduct,
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
// Builders
// ---------------------------------------------------------------------------
const AT = new Date('2026-06-15T00:00:00.000Z');

const scheme = (over = {}) => ({
  _id: 'sch-1',
  schemeCode: 'SPEC-1',
  schemeName: 'Spec scheme',
  appliesTo: 'dealer',
  status: 'Active',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  validTo: new Date('2026-12-31T00:00:00.000Z'),
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  scope: { level: 'all' },
  slabs: [],
  productSlabs: [],
  ...over
});

/** A slab. `to: null` is open-ended ("and above"). */
const slab = (from, to, reward, paymentTerms = {}) => ({ from, to, reward, paymentTerms });

const pts = (points) => ({ type: 'points', points });
const free = (qty, rule = 'sameProduct', product = null) => ({
  type: 'freeItem',
  freeItemQuantity: qty,
  freeItemRule: rule,
  freeItemProduct: product
});

/** A document line. `amount` is derived from qty x unitPrice when omitted. */
const line = (productId, quantity, unitPrice = 100, extra = {}) =>
  ({ productId, quantity, unitPrice, ...extra });

const run = (schemes, lines, opts = {}) =>
  evaluateSchemes({ schemes, dealer: {}, lines, at: AT, ...opts });

const only = (schemes, lines, opts) => run(schemes, lines, opts)[0] || null;

/**
 * Contract note: `evaluateSchemes` returns a result for every scheme whose SCOPE
 * matched, even when nothing is payable — that is what lets the Sales Order show
 * "₹13,000 more needed" instead of hiding the offer. `eligible` is the flag that
 * says whether it pays. A scheme whose scope did not match at all is omitted.
 */
const payable = (result) => Boolean(result && result.eligible);

/** The reward on the slab the engine picked, or null. */
const rewardOf = (result) => result?.slab?.reward || null;
const pointsOf = (result) => Number(rewardOf(result)?.points || 0);
const freeQtyOf = (result) => Number(rewardOf(result)?.freeItemQuantity || 0);

// ===========================================================================
section('1. PRODUCT MIX — same product: Buy 5 → 1 free, Buy 10 → 2 free');
// ===========================================================================
const sameProductScheme = scheme({
  slabs: [
    slab(0, 4, free(0)),
    slab(5, 9, free(1, 'sameProduct')),
    slab(10, null, free(2, 'sameProduct'))
  ]
});

eq('buy 4 -> nothing yet', freeQtyOf(only([sameProductScheme], [line('A', 4)])), 0);
eq('buy 5 -> 1 free', freeQtyOf(only([sameProductScheme], [line('A', 5)])), 1);
eq('buy 10 -> 2 free', freeQtyOf(only([sameProductScheme], [line('A', 10)])), 2);
eq('buy 25 -> still 2 free (highest tier only)', freeQtyOf(only([sameProductScheme], [line('A', 25)])), 2);

// The free product for "same product" must BE the product bought.
const fiveOfA = only([sameProductScheme], [line('A', 5, 250)]);
eq('the free item is Product A itself', resolveFreeItemProduct(fiveOfA.slab, fiveOfA.qualifyingLines).productId, 'A');

// ===========================================================================
section('1b. PRODUCT MIX — mixed products, all four free-item rules');
// ===========================================================================
const mixedLines = [
  line('A', 1, 100),
  line('B', 1, 50),
  line('C', 1, 200)
];

for (const [rule, expectedProduct, why] of [
  ['lowestPrice', 'B', 'cheapest qualifying line'],
  ['equalOrLower', 'B', 'cheapest qualifying line (same branch as lowestPrice)'],
  ['specificProduct', 'C', 'the product named on the slab'],
  ['sameProduct', 'C', 'dearest line — best value for the dealer']
]) {
  const s = scheme({
    slabs: [slab(3, null, free(1, rule, rule === 'specificProduct' ? 'C' : null))]
  });
  const res = only([s], mixedLines);
  eq(`rule "${rule}" -> ${why}`, resolveFreeItemProduct(res.slab, res.qualifyingLines).productId, expectedProduct);
  eq(`rule "${rule}" pays 1 free item`, freeQtyOf(res), 1);
}

// The free-item quantity is configurable per slab, not hardcoded.
const twoFree = only(
  [scheme({ slabs: [slab(3, null, free(2, 'lowestPrice'))] })],
  mixedLines
);
eq('free quantity is configurable (2)', freeQtyOf(twoFree), 2);

// ===========================================================================
section('2. PURCHASE AMOUNT — ₹20,000 -> 100, ₹50,000 -> 300, ₹1,00,000 -> 800');
// ===========================================================================
const amountScheme = scheme({
  condition: { basis: 'amount', accumulation: 'perInvoice' },
  slabs: [
    slab(0, 19999, pts(0)),
    slab(20000, 49999, pts(100)),
    slab(50000, 99999, pts(300)),
    slab(100000, null, pts(800))
  ]
});

eq('₹19,999 -> 0 points', pointsOf(only([amountScheme], [line('A', 1, 19999)])), 0);
eq('₹20,000 -> 100 points', pointsOf(only([amountScheme], [line('A', 1, 20000)])), 100);
eq('₹49,999 -> 100 points', pointsOf(only([amountScheme], [line('A', 1, 49999)])), 100);
eq('₹50,000 -> 300 points', pointsOf(only([amountScheme], [line('A', 1, 50000)])), 300);
eq('₹1,00,000 -> 800 points', pointsOf(only([amountScheme], [line('A', 1, 100000)])), 800);
eq('₹2,00,000 -> still 800 (not additive)', pointsOf(only([amountScheme], [line('A', 1, 200000)])), 800);
eq('several lines are summed (3 x ₹20,000 = 60000)',
  pointsOf(only([amountScheme], [line('A', 1, 20000), line('B', 1, 20000), line('C', 1, 20000)])), 300);

// ===========================================================================
section('3. PRODUCT-WISE QUANTITY — each product has its OWN slabs');
// ===========================================================================
const perProductScheme = scheme({
  productSlabs: [
    { product: 'A', label: 'A ladder', slabs: [slab(0, 4, free(0)), slab(5, 9, free(1)), slab(10, null, free(2))] },
    { product: 'B', label: 'B ladder', slabs: [slab(0, 9, free(0)), slab(10, 19, free(1)), slab(20, null, free(3))] }
  ]
});

const perProduct = (lines) => evaluateProductSlabs(perProductScheme.productSlabs, lines.map(normalizeLine), { basis: 'quantity' });
const evalFor = (evals, product) => evals.find((e) => e.product === product);
const hitOf = (evals, product) => evalFor(evals, product)?.slab?.reward?.freeItemQuantity ?? null;

const bothMid = perProduct([line('A', 5), line('B', 10)]);
eq('A: 5 pcs -> 1 free', hitOf(bothMid, 'A'), 1);
eq('B: 10 pcs -> 1 free', hitOf(bothMid, 'B'), 1);

const bothHigh = perProduct([line('A', 10), line('B', 20)]);
eq('A: 10 pcs -> 2 free', hitOf(bothHigh, 'A'), 2);
eq('B: 20 pcs -> 3 free', hitOf(bothHigh, 'B'), 3);

const onlyA = perProduct([line('A', 10)]);
eq('A alone still resolves its own tier', hitOf(onlyA, 'A'), 2);
// A product with NO lines must never be reported as eligible — otherwise every
// configured product would show as "eligible" on every basket, and the commit
// would freeze empty achievements for products the dealer never bought.
eq('B is not eligible when not bought', evalFor(onlyA, 'B').eligible, false);
eq('...and its reward is a bare zero tier', hitOf(onlyA, 'B'), 0);

const lowBoth = perProduct([line('A', 4), line('B', 9)]);
eq('A below its first paid tier -> 0 free', hitOf(lowBoth, 'A'), 0);
eq('B below its first paid tier -> 0 free', hitOf(lowBoth, 'B'), 0);
eq('A is still eligible (it was bought)', evalFor(lowBoth, 'A').eligible, true);

// The ladders are independent: A can be high while B is low.
const mixedHeights = perProduct([line('A', 10), line('B', 5)]);
eq('A high while B is low — A unaffected', hitOf(mixedHeights, 'A'), 2);
eq('A high while B is low — B unaffected', hitOf(mixedHeights, 'B'), 0);

// ===========================================================================
section('4/5/6. BRAND / CATEGORY / SUBCATEGORY — ONE common mechanism');
// ===========================================================================
const brandScheme = scheme({ _id: 'sch-brand', scope: { level: 'brand', brand: 'b1' }, slabs: [slab(1, null, pts(10))] });
const categoryScheme = scheme({ _id: 'sch-cat', scope: { level: 'category', category: 'c1' }, slabs: [slab(1, null, pts(20))] });
const subScheme = scheme({ _id: 'sch-sub', scope: { level: 'subcategory', subcategory: 's1' }, slabs: [slab(1, null, pts(30))] });

// One line that sits in brand b1 AND category c1 AND subcategory s1.
const inAll = [line('P', 1, 500, { brandId: 'b1', categoryId: 'c1', subcategoryId: 's1' })];
const allThree = run([brandScheme, categoryScheme, subScheme], inAll);
eq('a matching line satisfies all three levels at once', allThree.length, 3);

// A line from a DIFFERENT brand, same category.
const otherBrand = [line('P', 1, 500, { brandId: 'b2', categoryId: 'c1', subcategoryId: 's1' })];
const byBrand = run([brandScheme, categoryScheme, subScheme], otherBrand);
eq('a different brand fails the brand scheme', byBrand.some((r) => r.schemeId === 'sch-brand'), false);
eq('...but still passes the category scheme', byBrand.some((r) => r.schemeId === 'sch-cat'), true);
eq('...and the subcategory scheme', byBrand.some((r) => r.schemeId === 'sch-sub'), true);

// A line from a different category AND subcategory.
const otherCat = [line('P', 1, 500, { brandId: 'b1', categoryId: 'c9', subcategoryId: 's9' })];
const byCat = run([brandScheme, categoryScheme, subScheme], otherCat);
eq('only the brand scheme survives', byCat.map((r) => r.schemeId), ['sch-brand']);

// Level 'all' ignores every dimension.
const allScheme = scheme({ _id: 'sch-all', scope: { level: 'all' }, slabs: [slab(1, null, pts(1))] });
eq('level "all" matches any line', run([allScheme], otherCat).length, 1);

// ===========================================================================
section('7. SELECTED PRODUCTS — scheme applies ONLY to the chosen products');
// ===========================================================================
const selectedScheme = scheme({
  scope: { level: 'product', products: ['A', 'B', 'C', 'D'] },
  slabs: [slab(1, null, pts(50))]
});

eq('Product A qualifies', run([selectedScheme], [line('A', 1)]).length, 1);
eq('Product D qualifies', run([selectedScheme], [line('D', 1)]).length, 1);
eq('Product E does NOT qualify', run([selectedScheme], [line('E', 1)]).length, 0);
eq('a basket of A+E measures only A', run([selectedScheme], [line('A', 2), line('E', 5)])[0].measuredValue, 2);

// ===========================================================================
section('8. PRODUCT MIX GROUPS — every group minimum must be met');
// ===========================================================================
const groupScope = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Group A', brand: 'brandA', minQuantity: 5 },
    { groupName: 'Group B', brand: 'brandB', minQuantity: 10 }
  ]
};

const mixEval = (lines) => evaluateMixGroups(groupScope, lines.map(normalizeLine), 'quantity');

const a5b10 = mixEval([line('P', 5, 100, { brandId: 'brandA' }), line('Q', 10, 100, { brandId: 'brandB' })]);
eq('5 of A + 10 of B -> satisfied', a5b10.satisfied, true);
eq('group A measured 5', a5b10.groups[0].measuredQuantity, 5);
eq('group B measured 10', a5b10.groups[1].measuredQuantity, 10);

const a5b9 = mixEval([line('P', 5, 100, { brandId: 'brandA' }), line('Q', 9, 100, { brandId: 'brandB' })]);
eq('5 + 9 -> NOT satisfied (B short)', a5b9.satisfied, false);
eq('group A alone is fine', a5b9.groups[0].ok, true);
eq('group B is the one that fails', a5b9.groups[1].ok, false);

const a4b10 = mixEval([line('P', 4, 100, { brandId: 'brandA' }), line('Q', 10, 100, { brandId: 'brandB' })]);
eq('4 + 10 -> NOT satisfied (A short)', a4b10.satisfied, false);

// A scheme scoped to mix only pays when every group is satisfied.
const mixScheme = scheme({ _id: 'sch-mix', scope: groupScope, slabs: [slab(1, null, pts(500))] });
eq('mix scheme pays when satisfied',
  pointsOf(only([mixScheme], [line('P', 5, 100, { brandId: 'brandA' }), line('Q', 10, 100, { brandId: 'brandB' })])), 500);
eq('mix scheme is surfaced but NOT payable when a group is short',
  payable(only([mixScheme], [line('P', 5, 100, { brandId: 'brandA' }), line('Q', 9, 100, { brandId: 'brandB' })])), false);

// "A + B + C -> minimum 20 pcs total" is one group covering three products.
const totalGroupScope = {
  level: 'mix',
  mixGroups: [{ groupName: 'A+B+C', products: ['A', 'B', 'C'], minQuantity: 20 }]
};
const totalEval = (n) => evaluateMixGroups(
  totalGroupScope,
  [line('A', n, 10), line('B', n, 10), line('C', n, 10)].map(normalizeLine),
  'quantity'
);
eq('A+B+C = 21 pcs -> satisfied', totalEval(7).satisfied, true);
eq('A+B+C = 18 pcs -> NOT satisfied', totalEval(6).satisfied, false);

// Amount-based group minimum.
const amtGroup = { level: 'mix', mixGroups: [{ groupName: 'Big', category: 'catX', minAmount: 50000 }] };
const amtEval = (value) => evaluateMixGroups(amtGroup, [line('P', 1, value, { categoryId: 'catX' })].map(normalizeLine), 'amount');
eq('₹50,000 group minimum met', amtEval(50000).satisfied, true);
eq('₹49,999 group minimum missed', amtEval(49999).satisfied, false);

// ===========================================================================
section('9. RATIO — Pipes 50% / Fittings 50%, and Category A 70% / Category B 30%');
// ===========================================================================
const ratioScope = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Pipes', brand: 'brandPipes', minQuantity: 1, ratioPercentage: 50 },
    { groupName: 'Fittings', brand: 'brandFittings', minQuantity: 1, ratioPercentage: 50 }
  ]
};
const ratioEval = (pipes, fittings) => evaluateMixGroups(
  ratioScope,
  [line('P', pipes, 100, { brandId: 'brandPipes' }), line('F', fittings, 100, { brandId: 'brandFittings' })].map(normalizeLine),
  'quantity'
);

eq('50 / 50 -> satisfied', ratioEval(50, 50).satisfied, true);
eq('Pipes share is 50%', Math.round(ratioEval(50, 50).groups[0].sharePercentage), 50);
eq('90 / 10 -> NOT satisfied (Fittings short)', ratioEval(90, 10).satisfied, false);
eq('Fittings share is 10%', Math.round(ratioEval(90, 10).groups[1].sharePercentage), 10);
eq('60 / 40 -> NOT satisfied under a 50/50 rule', ratioEval(60, 40).satisfied, false);

// 70 / 30 is expressed as relative weights and normalised against their own sum.
const ratio7030 = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Category A', category: 'catA', minQuantity: 1, ratioPercentage: 70 },
    { groupName: 'Category B', category: 'catB', minQuantity: 1, ratioPercentage: 30 }
  ]
};
const ratio7030Eval = (a, b) => evaluateMixGroups(
  ratio7030,
  [line('A', a, 100, { categoryId: 'catA' }), line('B', b, 100, { categoryId: 'catB' })].map(normalizeLine),
  'quantity'
);

eq('70 / 30 -> satisfied', ratio7030Eval(70, 30).satisfied, true);
eq('required share normalises to 70%', Math.round(ratio7030Eval(70, 30).groups[0].requiredShare), 70);
eq('required share normalises to 30%', Math.round(ratio7030Eval(70, 30).groups[1].requiredShare), 30);
eq('50 / 50 -> NOT satisfied under 70/30', ratio7030Eval(50, 50).satisfied, false);
eq('75 / 25 -> NOT satisfied (B short)', ratio7030Eval(75, 25).satisfied, false);

// Groups without a ratio are absolute-minimum groups, not ratio participants.
const mixedRatio = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Must have 5', brand: 'brandPipes', minQuantity: 5 },
    { groupName: 'Ratio 50', brand: 'brandFittings', minQuantity: 1, ratioPercentage: 50 },
    { groupName: 'Ratio 50b', brand: 'brandValves', minQuantity: 1, ratioPercentage: 50 }
  ]
};
const mixedEval = evaluateMixGroups(mixedRatio, [
  line('P', 5, 100, { brandId: 'brandPipes' }),
  line('F', 50, 100, { brandId: 'brandFittings' }),
  line('V', 50, 100, { brandId: 'brandValves' })
].map(normalizeLine), 'quantity');
eq('a non-ratio group only needs its minimum', mixedEval.groups[0].ratioPercentage, 0);
eq('the ratio groups share 50/50 of the ratio total', mixedEval.satisfied, true);

// ===========================================================================
section('10. CUMULATIVE PURCHASE — ₹7,000 + ₹6,000 + ₹8,000 = ₹21,000 qualifies');
// ===========================================================================
const cumulativeScheme = scheme({
  condition: { basis: 'amount', accumulation: 'cumulative' },
  slabs: [slab(20000, null, pts(400))]
});
const banked = (value) => ({ 'sch-1': value });

eq('₹7,000 alone -> not payable (below target)',
  payable(only([cumulativeScheme], [line('A', 1, 7000)])), false);
eq('...and no slab was crossed',
  only([cumulativeScheme], [line('A', 1, 7000)]).slab, null);
eq('₹7,000 + ₹6,000 = ₹13,000 -> still not payable',
  payable(only([cumulativeScheme], [line('A', 1, 6000)], { existingProgressByScheme: banked(7000) })), false);
const thirdInvoice = only([cumulativeScheme], [line('A', 1, 8000)], { existingProgressByScheme: banked(13000) });
eq('+ ₹8,000 = ₹21,000 -> qualifies', pointsOf(thirdInvoice), 400);
eq('...and is payable', payable(thirdInvoice), true);
eq('the measured total is the running total', thirdInvoice.measuredValue, 21000);
eq('and this invoice contributed 8,000', thirdInvoice.thisDocumentValue, 8000);
eq('with 13,000 already banked', thirdInvoice.bankedValue, 13000);

// perInvoice must NOT accumulate.
const perInvoiceScheme = scheme({
  condition: { basis: 'amount', accumulation: 'perInvoice' },
  slabs: [slab(20000, null, pts(400))]
});
eq('perInvoice: the same ₹8,000 invoice does not qualify',
  payable(only([perInvoiceScheme], [line('A', 1, 8000)], { existingProgressByScheme: banked(13000) })), false);
eq('perInvoice: a single ₹20,000 invoice does qualify',
  pointsOf(only([perInvoiceScheme], [line('A', 1, 20000)])), 400);

// Quantity also accumulates.
const cumulativeQty = scheme({
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  slabs: [slab(0, 9, free(0)), slab(10, null, free(1))]
});
eq('4 pcs then 6 pcs = 10 -> 1 free',
  freeQtyOf(only([cumulativeQty], [line('A', 6)], { existingProgressByScheme: banked(4) })), 1);
eq('4 pcs then 5 pcs = 9 -> nothing',
  freeQtyOf(only([cumulativeQty], [line('A', 5)], { existingProgressByScheme: banked(4) })), 0);

// ===========================================================================
section('11. PURCHASE + PAYMENT CONDITION — Immediate vs 30-day ladders');
// ===========================================================================
const immediate = { fromCreditDays: 0, toCreditDays: 0 };
const thirtyDay = { fromCreditDays: 30, toCreditDays: null };
const payScheme = scheme({
  slabs: [
    slab(5, 9, free(1), immediate),
    slab(10, null, free(2), immediate),
    slab(8, 14, free(1), thirtyDay),
    slab(15, null, free(2), thirtyDay)
  ]
});

const withDays = (qty, days) => only([payScheme], [line('A', qty)], { paymentTerms: days });

eq('immediate: buy 5 -> 1 free', freeQtyOf(withDays(5, 0)), 1);
eq('immediate: buy 10 -> 2 free', freeQtyOf(withDays(10, 0)), 2);
eq('immediate: buy 8 -> 1 free (immediate tier 5-9)', freeQtyOf(withDays(8, 0)), 1);
eq('30 days: buy 8 -> 1 free', freeQtyOf(withDays(8, 30)), 1);
eq('30 days: buy 15 -> 2 free', freeQtyOf(withDays(15, 30)), 2);
eq('30 days: buy 5 -> NOTHING (that tier starts at 8)', withDays(5, 30).slab, null);
eq('30 days: buy 5 -> not payable', payable(withDays(5, 30)), false);
eq('30 days: buy 14 -> 1 free', freeQtyOf(withDays(14, 30)), 1);
eq('immediate: buy 15 -> 2 free (immediate open tier)', freeQtyOf(withDays(15, 0)), 2);

// A slab with no payment terms applies under ANY condition — this is what keeps
// every pre-existing scheme working untouched.
const untargetedScheme = scheme({ slabs: [slab(5, null, free(1))] });
eq('untargeted slab passes on immediate', freeQtyOf(withDays.call(null, 5, 0) && only([untargetedScheme], [line('A', 5)], { paymentTerms: 0 })), 1);
eq('untargeted slab passes on 30 days', freeQtyOf(only([untargetedScheme], [line('A', 5)], { paymentTerms: 30 })), 1);
eq('untargeted slab passes on 90 days', freeQtyOf(only([untargetedScheme], [line('A', 5)], { paymentTerms: 90 })), 1);
eq('untargeted slab passes with no credit days given', freeQtyOf(only([untargetedScheme], [line('A', 5)])), 1);

// When NO slab targets payment terms, the credit days are ignored entirely.
const noTermsScheme = scheme({ slabs: [slab(0, 9, free(0)), slab(10, null, free(2))] });
eq('credit days ignored when no slab targets them',
  freeQtyOf(only([noTermsScheme], [line('A', 10)], { paymentTerms: 0 })), 2);

// ===========================================================================
section('12. SLAB-BASED — From / To / Benefit, quantity and amount');
// ===========================================================================
const qtyLadder = [
  slab(5, 9, free(1)),
  slab(10, 19, free(2)),
  slab(20, 29, free(4))
];
const qtySlab = (q) => resolveSlab(qtyLadder, q)?.reward?.freeItemQuantity ?? null;

eq('4 -> below the first slab', qtySlab(4), null);
eq('5 -> 1 free', qtySlab(5), 1);
eq('9 -> 1 free', qtySlab(9), 1);
eq('10 -> 2 free', qtySlab(10), 2);
eq('19 -> 2 free', qtySlab(19), 2);
eq('20 -> 4 free', qtySlab(20), 4);
eq('29 -> 4 free', qtySlab(29), 4);
eq('30 -> nothing (the top slab is bounded at 29)', qtySlab(30), null);

const amtLadder = [
  slab(20000, 49999, pts(100)),
  slab(50000, 99999, pts(300)),
  slab(100000, null, pts(800))
];
const amtSlab = (v) => resolveSlab(amtLadder, v)?.reward?.points ?? null;

eq('₹20,000 -> 100 points', amtSlab(20000), 100);
eq('₹49,999 -> 100 points', amtSlab(49999), 100);
eq('₹50,000 -> 300 points', amtSlab(50000), 300);
eq('₹99,999 -> 300 points', amtSlab(99999), 300);
eq('₹1,00,000 -> 800 points', amtSlab(100000), 800);
eq('₹5,00,000 -> 800 points (open-ended top slab)', amtSlab(500000), 800);

// Highest qualifying only, never additive.
eq('a value in the middle band pays ONLY that band',
  resolveSlab(amtLadder, 60000).reward.points, 300);
eq('it does not add the lower band (100 + 300 would be 400)',
  resolveSlab(amtLadder, 60000).reward.points === 400, false);

// ===========================================================================
section('13. POINTS WITH SLABS — ₹10,000 -> 100, ₹25,000 -> 300, ₹50,000 -> 700');
// ===========================================================================
const pointsScheme = scheme({
  condition: { basis: 'amount', accumulation: 'perInvoice' },
  slabs: [
    slab(0, 9999, pts(0)),
    slab(10000, 24999, pts(100)),
    slab(25000, 49999, pts(300)),
    slab(50000, null, pts(700))
  ]
});
const pointsAt = (value) => pointsOf(only([pointsScheme], [line('A', 1, value)]));

eq('₹9,999 -> 0 points', pointsAt(9999), 0);
eq('₹10,000 -> 100 points', pointsAt(10000), 100);
eq('₹24,999 -> 100 points', pointsAt(24999), 100);
eq('₹25,000 -> 300 points', pointsAt(25000), 300);
eq('₹49,999 -> 300 points', pointsAt(49999), 300);
eq('₹50,000 -> 700 points', pointsAt(50000), 700);
eq('₹1,00,000 -> still 700 (highest only)', pointsAt(100000), 700);

// Bonus points for a specific PRODUCT = a per-product ladder alongside the flat one.
const bonusScheme = scheme({
  condition: { basis: 'amount', accumulation: 'perInvoice' },
  slabs: [slab(10000, null, pts(100))],
  productSlabs: [
    { product: 'A', label: 'Product A bonus', slabs: [slab(5000, null, pts(50))] }
  ]
});
const bonusResult = only([bonusScheme], [line('A', 1, 12000)]);
eq('the flat ladder still pays its 100 points', pointsOf(bonusResult), 100);
eq('Product A additionally earns its 50 bonus points',
  bonusResult.productSlabHits.length, 1);
eq('the bonus ladder resolved 50 points',
  bonusResult.productSlabHits[0].slab.reward.points, 50);

// A product that is not on the bonus ladder earns no bonus.
const noBonus = only([bonusScheme], [line('Z', 1, 12000)]);
eq('an unblessed product earns no bonus', noBonus.productSlabHits.length, 0);
eq('...but the flat ladder still pays', pointsOf(noBonus), 100);

// A bonus scoped to a BRAND / CATEGORY / SUBCATEGORY is a scheme scoped to that
// dimension (items 4/5/6) with its own points ladder.
const brandBonus = scheme({
  _id: 'sch-brandbonus',
  scope: { level: 'brand', brand: 'b1' },
  condition: { basis: 'amount', accumulation: 'perInvoice' },
  slabs: [slab(5000, null, pts(75))]
});
eq('a brand-scoped bonus pays on that brand only',
  pointsOf(only([brandBonus], [line('P', 1, 6000, { brandId: 'b1' })])), 75);
eq('...and not on another brand',
  only([brandBonus], [line('P', 1, 6000, { brandId: 'b2' })]), null);

// ===========================================================================
section('CROSS-CUTTING — rules that apply to every item above');
// ===========================================================================

// Highest qualifying slab only.
const overlap = [slab(0, 100, pts(10)), slab(50, 200, pts(20))];
eq('overlapping slabs: the higher "from" wins at 150',
  resolveSlab(overlap, 150).reward.points, 20);
eq('overlapping slabs: at 40 only the first qualifies',
  resolveSlab(overlap, 40).reward.points, 10);

// A scheme outside its validity window never fires.
const expired = scheme({
  validTo: new Date('2026-01-31T00:00:00.000Z'),
  slabs: [slab(1, null, pts(999))]
});
eq('an expired scheme pays nothing', only([expired], [line('A', 100)]), null);

const notYet = scheme({ validFrom: new Date('2026-12-01T00:00:00.000Z'), slabs: [slab(1, null, pts(999))] });
eq('a not-yet-started scheme pays nothing', only([notYet], [line('A', 100)]), null);

const paused = scheme({ status: 'Paused', slabs: [slab(1, null, pts(999))] });
eq('a paused scheme pays nothing', only([paused], [line('A', 100)]), null);

// No qualifying line -> the scheme does not even appear.
const brandOnly = scheme({ scope: { level: 'brand', brand: 'b1' }, slabs: [slab(1, null, pts(10))] });
eq('a scheme with no matching line is not returned at all',
  run([brandOnly], [line('P', 1, 100, { brandId: 'bX' })]).length, 0);

// CD and Regular accumulate together — sales type is deliberately not a dimension.
const bothTypes = run(
  [scheme({ slabs: [slab(0, 9, free(0)), slab(10, null, free(1))] })],
  [line('A', 5, 100, { salesType: 'CD' }), line('A', 5, 100, { salesType: 'Regular' })]
);
eq('CD + Regular quantities accumulate into one bucket', bothTypes[0].measuredValue, 10);
eq('...and reach the 10-unit tier', freeQtyOf(bothTypes[0]), 1);

// Priority ordering — consumers can take [0].
const low = scheme({ _id: 'low', priority: 1, slabs: [slab(1, null, pts(1))] });
const high = scheme({ _id: 'high', priority: 9, slabs: [slab(1, null, pts(1))] });
eq('the higher-priority scheme is returned first',
  run([low, high], [line('A', 5)]).map((r) => r.schemeId), ['high', 'low']);

// The "X more to unlock" hint.
const nextSlab = run([scheme({ slabs: [slab(0, 9, free(0)), slab(10, null, free(1))] })], [line('A', 4)])[0];
eq('nextSlab.from is the next tier', nextSlab.nextSlab.from, 10);
eq('4 pcs -> 6 more needed', nextSlab.nextSlab.from - nextSlab.measuredValue, 6);

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailed assertions:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
