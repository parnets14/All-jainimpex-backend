/**
 * Focused harness for the Sales Order scheme preview.
 *
 * The panel on the create-order screen is driven entirely by
 * `previewSchemesForLines`, so this suite pins down the one behaviour the
 * business actually asked for:
 *
 *   A scheme that is NOT yet eligible must STILL be returned, as long as the
 *   order touches its scope.
 *
 * That is what makes a cumulative offer usable. "Buy 10 get 1 free" completed
 * as 4 pcs on the first order and 6 on the second: on the first order the
 * scheme is short by 6, and if the preview hid it the salesman could never
 * opt into it early — which is exactly when the choice has to be made.
 *
 * Runs against a stubbed connection, so no MongoDB is needed.
 *
 * Run: node services/__schemePreview.test.mjs
 */

import { previewSchemesForLines, commitInvoiceAchievements } from './schemeEngine.js';

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const eq = (label, actual, expected) =>
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const section = (name) => console.log(`\n--- ${name} ---`);

/** Chainable stand-in for a mongoose query (populate/lean/session). */
const chainable = (rows) => {
  const node = {
    populate: () => node,
    session: () => node,
    lean: async () => rows
  };
  return node;
};

const stubConnection = ({ schemes = [], dealer = null, progressRows = [] } = {}) => ({
  models: {
    Dealer: { findById: () => chainable(dealer) },
    Scheme: { find: () => chainable(schemes) },
    SchemeProgress: { find: () => chainable(progressRows) },
    // Present so getSchemeModels() never falls through to dbConnection.model().
    // The preview path does not touch these.
    SchemeApplication: {},
    Product: { find: () => chainable([]) }
  },
  model: () => { throw new Error('stub must not create a model'); }
});

const PRODUCT_ID = 'prod-1';
const DEALER = { _id: 'dealer-1', name: 'Sharma Traders', code: 'D-001' };

/** Buy 10 get 1 free, scoped to one product, cumulative. */
const buyTenGetOne = {
  _id: 'scheme-buy10',
  schemeCode: 'OCT-BUY-10',
  schemeName: 'Buy 10 Get 1 Free',
  appliesTo: 'dealer',
  status: 'Active',
  validFrom: new Date('2026-01-01'),
  validTo: new Date('2026-12-31'),
  scope: { level: 'product', products: [PRODUCT_ID] },
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  dealerScope: {},
  slabs: [
    { seq: 1, from: 0, to: 9, label: 'Below offer', reward: { points: 0 } },
    { seq: 2, from: 10, to: null, label: 'Free item', reward: { freeItemQuantity: 1, freeItemRule: 'sameProduct' } }
  ]
};

const orderLine = (quantity) => ({ productId: PRODUCT_ID, quantity });

// ---------------------------------------------------------------------------
section('an in-progress scheme is still offered (the whole point)');
// ---------------------------------------------------------------------------
// First order: only 4 pcs, so 10 is not reached. The scheme MUST come back.
const first = await previewSchemesForLines(stubConnection({ schemes: [buyTenGetOne], dealer: DEALER }), {
  dealerId: 'dealer-1',
  lines: [orderLine(4)]
});

eq('the scheme is returned even though it is short', first.schemes.length, 1);
eq('its code is present for the picker', first.schemes[0].schemeCode, 'OCT-BUY-10');
eq('its name is present for the picker', first.schemes[0].schemeName, 'Buy 10 Get 1 Free');
eq('the measured value reflects this order', first.schemes[0].measuredValue, 4);

// NOTE: `eligible` here means "some slab matched", NOT "the dealer earns
// something". Because the first rung starts at 0 (the recommended layout, so a
// small order earns nothing), `eligible` is true the moment the scope matches.
// The UI must therefore look at whether the matched slab actually PAYS before
// labelling a scheme "Eligible" — see the payableReward assertions below.
check('eligible means a slab matched, not that it pays', first.schemes[0].eligible === true);
eq('the matched slab is the zero-reward rung', first.schemes[0].achievedSlab.slabSeq, 1);
eq('which pays nothing', first.schemes[0].achievedSlab.reward.points, 0);

check('a next slab IS offered so the UI can say how much is left', first.schemes[0].nextSlab !== null);
eq('the next slab starts at 10', first.schemes[0].nextSlab.from, 10);
eq('and 6 more are needed', first.schemes[0].nextSlab.remaining, 6);
eq('the next slab carries the real reward', first.schemes[0].nextSlab.reward.freeItemQuantity, 1);

// ---------------------------------------------------------------------------
section('the second order completes it — cumulative across documents');
// ---------------------------------------------------------------------------
// 6 more, with 4 already banked, reaches exactly 10. Progress rows are read on
// the scheme's own basis, so a quantity scheme reads `measuredQuantity`.
const second = await previewSchemesForLines(
  stubConnection({
    schemes: [buyTenGetOne],
    dealer: DEALER,
    progressRows: [{ scheme: 'scheme-buy10', basis: 'quantity', measuredQuantity: 4 }]
  }),
  { dealerId: 'dealer-1', lines: [orderLine(6)] }
);

eq('still one scheme', second.schemes.length, 1);
eq('now eligible', second.schemes[0].eligible, true);
eq('measured value is banked + this order', second.schemes[0].measuredValue, 10);
check('an achieved slab is reported', second.schemes[0].achievedSlab !== null);
eq('the achieved slab is the free-item tier', second.schemes[0].achievedSlab.slabSeq, 2);
eq('the free item quantity is exposed for the UI', second.schemes[0].achievedSlab.reward.freeItemQuantity, 1);
check('nothing further is promised', second.schemes[0].nextSlab === null);

// ---------------------------------------------------------------------------
section('a scheme outside the order scope is not offered');
// ---------------------------------------------------------------------------
const otherScheme = {
  ...buyTenGetOne,
  _id: 'scheme-other',
  schemeCode: 'OCT-OTHER',
  scope: { level: 'product', products: ['prod-999'] }
};

const unrelated = await previewSchemesForLines(
  stubConnection({ schemes: [buyTenGetOne, otherScheme], dealer: DEALER }),
  { dealerId: 'dealer-1', lines: [orderLine(4)] }
);
eq('only the scoped scheme is offered', unrelated.schemes.length, 1);
eq('and it is the right one', unrelated.schemes[0].schemeCode, 'OCT-BUY-10');

// ---------------------------------------------------------------------------
section('no dealer / no lines degrade safely');
// ---------------------------------------------------------------------------
const noDealer = await previewSchemesForLines(stubConnection({ schemes: [buyTenGetOne] }), {
  dealerId: 'missing',
  lines: [orderLine(4)]
});
eq('an unknown dealer yields no schemes', noDealer.schemes.length, 0);

const emptyBasket = await previewSchemesForLines(stubConnection({ schemes: [buyTenGetOne], dealer: DEALER }), {
  dealerId: 'dealer-1',
  lines: []
});
eq('an empty basket yields no schemes', emptyBasket.schemes.length, 0);

// ---------------------------------------------------------------------------
section('SAFETY: the opt-in gate at commit time');
// ---------------------------------------------------------------------------
// The Sales Order screen only sends a selection once its preview has actually
// answered — if the lookup fails it omits the field entirely. These two cases
// are what make that interlock safe, so they are asserted directly.
//
// A fully-qualified invoice line: 10 pcs against a slab that starts at 10.
const qualifyingLines = [{ productId: PRODUCT_ID, quantity: 10, unitPrice: 100 }];

// GATE ON WITH NOTHING ALLOWED -> the dealer gets nothing. This is the shape the
// client sends when the salesman deliberately ticked no scheme.
const blocked = await commitInvoiceAchievements(
  stubConnection({ schemes: [buyTenGetOne], dealer: DEALER }),
  { dealerId: 'dealer-1', invoiceId: 'inv-1', lines: qualifyingLines, schemeIds: [] }
);
eq('an empty selection commits no achievement', blocked.length, 0);

// GATE ON WITH THE SCHEME ALLOWED -> it commits. The fake bucket records that
// the engine got as far as writing, which is what proves the gate let it pass.
const stubBucket = () => ({
  contributions: [],
  achievements: [],
  recomputeTotals() {},
  refreshNextSlab() {},
  markModified() {},
  async save() {}
});

const allowingConnection = stubConnection({ schemes: [buyTenGetOne], dealer: DEALER });
let reachedUpsert = false;
allowingConnection.models.SchemeProgress.findOneAndUpdate = async () => {
  reachedUpsert = true;
  return stubBucket();
};
await commitInvoiceAchievements(allowingConnection, {
  dealerId: 'dealer-1', invoiceId: 'inv-2', lines: qualifyingLines, schemeIds: ['scheme-buy10']
});
check('a selected scheme is allowed through the gate', reachedUpsert);

// NO GATE -> also allowed through (legacy behaviour, unchanged by this feature).
const legacyConnection = stubConnection({ schemes: [buyTenGetOne], dealer: DEALER });
let legacyUpsert = false;
legacyConnection.models.SchemeProgress.findOneAndUpdate = async () => {
  legacyUpsert = true;
  return stubBucket();
};
await commitInvoiceAchievements(legacyConnection, {
  dealerId: 'dealer-1', invoiceId: 'inv-3', lines: qualifyingLines
});
check('omitting schemeIds keeps the pre-existing no-gate behaviour', legacyUpsert);

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
