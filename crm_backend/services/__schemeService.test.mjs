/**
 * Focused harness for the purchase-scheme evaluator in schemeService.
 *
 * These exercise the pure decision logic that runs when a Goods Receipt is
 * inspected — WITHOUT touching MongoDB. The `Points` model has no `status`
 * field and no `thresholdValue`/`benefitValue` fields, so the whole point of
 * this suite is to pin down the REAL field names and the real behaviour:
 *
 *   - scope matching uses brand + category + subcategory (a required triple)
 *   - highest qualifying slab only; tiers never stack
 *   - legacy single-threshold rows still work via the synthetic one-tier ladder
 *   - a slab carrying several rewards pays all of them
 *   - a percentage discount is computed off the money value even on a
 *     units-based scheme
 *   - points and free units are NOT added into the monetary roll-up
 *
 * Run: node services/__schemeService.test.mjs
 */

import {
  idOf,
  itemMatchesScope,
  slabsFor,
  resolvePurchaseSlab,
  measurePurchaseItems,
  computeSlabReward,
  rewardHasValue,
  describeReward
} from './schemeService.js';

import schemeService from './schemeService.js';

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

const section = (name) => console.log(`\n--- ${name} ---`);

const eq = (label, actual, expected) =>
  check(label, actual === expected, `expected ${expected}, got ${actual}`);

// Shared fixtures. Ids are plain strings so no ObjectId import is needed.
const BRAND_A = 'brand-a';
const CAT_1 = 'cat-1';
const SUB_X = 'sub-x';
const SUB_Y = 'sub-y';

const purchaseScheme = (overrides = {}) => ({
  type: 'purchase',
  brand: BRAND_A,
  category: CAT_1,
  subcategory: SUB_X,
  calculationType: 'amount',
  slabs: [
    { seq: 1, from: 10000, to: 49999, label: 'Tier 1', reward: { points: 100 } },
    { seq: 2, from: 50000, to: null, label: 'Tier 2', reward: { points: 600 } }
  ],
  ...overrides
});

const line = (overrides = {}) => ({
  productId: 'p1',
  brand: BRAND_A,
  category: CAT_1,
  subcategory: SUB_X,
  acceptedQuantity: 10,
  unitPrice: 1000,
  ...overrides
});

// ---------------------------------------------------------------------------
section('idOf normalises every ref shape');
// ---------------------------------------------------------------------------
eq('plain string passes through', idOf('abc'), 'abc');
eq('null -> null', idOf(null), null);
eq('undefined -> null', idOf(undefined), null);
eq('populated doc -> its _id', idOf({ _id: 'xyz', name: 'Brand' }), 'xyz');
check('number is stringified', idOf(42) === '42');

// ---------------------------------------------------------------------------
section('scope matching — the required brand/category/subcategory triple');
// ---------------------------------------------------------------------------
const scheme = purchaseScheme();

check('exact triple matches', itemMatchesScope(scheme, line()) === true);
check(
  'wrong subcategory does not match',
  itemMatchesScope(scheme, line({ subcategory: SUB_Y })) === false
);
check(
  'wrong brand does not match',
  itemMatchesScope(scheme, line({ brand: 'brand-b' })) === false
);
check(
  'line missing a scoped dimension does not match',
  itemMatchesScope(scheme, line({ subcategory: undefined })) === false,
  'a scheme that scopes on subcategory must not pay out on an unresolved line'
);
check(
  'populated scheme refs compare correctly',
  itemMatchesScope(
    purchaseScheme({ brand: { _id: BRAND_A }, category: { _id: CAT_1 } }),
    line()
  ) === true
);
check(
  'unset scheme dimension acts as a wildcard',
  itemMatchesScope(purchaseScheme({ subcategory: null }), line({ subcategory: SUB_Y })) === true
);
check('empty item against unscoped scheme matches', itemMatchesScope({}, {}) === true);

// ---------------------------------------------------------------------------
section('slabsFor — legacy rows synthesise a one-tier ladder');
// ---------------------------------------------------------------------------
const legacy = { inputValue: 25000, points: 250, calculationType: 'amount' };
const legacySlabs = slabsFor(legacy);
eq('legacy row yields exactly one slab', legacySlabs.length, 1);
eq('legacy slab starts at inputValue', legacySlabs[0].from, 25000);
eq('legacy slab is open-ended', legacySlabs[0].to, null);
eq('legacy slab carries the points reward', legacySlabs[0].reward.points, 250);

eq('modern slabs are returned as-is', slabsFor(purchaseScheme()).length, 2);
eq('a scheme with neither shape yields none', slabsFor({ calculationType: 'amount' }).length, 0);
eq(
  'unsorted slabs come back sorted by `from`',
  slabsFor({ slabs: [{ seq: 2, from: 500, to: null }, { seq: 1, from: 100, to: 499 }] })[0].from,
  100
);

// ---------------------------------------------------------------------------
section('resolvePurchaseSlab — highest qualifying only, never additive');
// ---------------------------------------------------------------------------
const ladder = slabsFor(purchaseScheme());
eq('below the first tier -> null', resolvePurchaseSlab(ladder, 5000), null);
eq('exactly on the first boundary -> tier 1', resolvePurchaseSlab(ladder, 10000).seq, 1);
eq('inside tier 1 -> tier 1', resolvePurchaseSlab(ladder, 30000).seq, 1);
eq('on the tier 1 upper bound -> tier 1', resolvePurchaseSlab(ladder, 49999).seq, 1);
eq('just past tier 1 -> tier 2', resolvePurchaseSlab(ladder, 50000).seq, 2);
eq('far above everything -> top open tier', resolvePurchaseSlab(ladder, 900000).seq, 2);
eq('no slabs at all -> null', resolvePurchaseSlab([], 100000), null);
eq(
  'open-ended tier wins over a lower one',
  resolvePurchaseSlab(
    [{ seq: 1, from: 0, to: null, reward: {} }, { seq: 2, from: 500, to: null, reward: {} }],
    1000
  ).seq,
  2
);

// ---------------------------------------------------------------------------
section('measurePurchaseItems — respects the scheme basis');
// ---------------------------------------------------------------------------
const lines = [line({ acceptedQuantity: 3, unitPrice: 100 }), line({ acceptedQuantity: 2, unitPrice: 250 })];
eq('amount basis sums qty x price', measurePurchaseItems(lines, 'amount'), 800);
eq('units basis sums quantity only', measurePurchaseItems(lines, 'units'), 5);
eq('empty list measures zero', measurePurchaseItems([], 'amount'), 0);
eq('missing quantity is treated as zero', measurePurchaseItems([{ unitPrice: 100 }], 'amount'), 0);
eq('unknown basis falls back to amount', measurePurchaseItems(lines, 'nonsense'), 800);

// ---------------------------------------------------------------------------
section('computeSlabReward — all rewards on the slab are paid');
// ---------------------------------------------------------------------------
const multi = computeSlabReward(
  { reward: { points: 50, extraQuantity: 2, discountPercentage: 5, cashbackAmount: 100 } },
  20000
);
eq('points pass through', multi.points, 50);
eq('extra quantity passes through', multi.extraQuantity, 2);
eq('discount is floored off the money value', multi.discountAmount, 1000);
eq('cashback passes through', multi.cashbackAmount, 100);
eq(
  'a units-based scheme still discounts the money value',
  computeSlabReward({ reward: { discountPercentage: 10 } }, 3333).discountAmount,
  333
);
eq(
  'zero percentage yields zero discount',
  computeSlabReward({ reward: { discountPercentage: 0 } }, 50000).discountAmount,
  0
);
eq('an empty reward is all zeros', computeSlabReward({}, 9999).points, 0);
eq('slab description is preserved', computeSlabReward({ reward: { description: 'Diwali' } }).description, 'Diwali');

// ---------------------------------------------------------------------------
section('rewardHasValue gates empty payouts');
// ---------------------------------------------------------------------------
check('all-zero reward has no value', rewardHasValue({ points: 0, extraQuantity: 0, discountAmount: 0, cashbackAmount: 0 }) === false);
check('points alone counts', rewardHasValue({ points: 1 }) === true);
check('cashback alone counts', rewardHasValue({ cashbackAmount: 1 }) === true);
check('empty object has no value', rewardHasValue({}) === false);

// ---------------------------------------------------------------------------
section('describeReward builds the audit line');
// ---------------------------------------------------------------------------
check(
  'a slab description wins over the generated text',
  describeReward({ description: 'Festive offer' }, 'amount', 1000) === 'Festive offer'
);
const described = describeReward({ points: 100, discountAmount: 500, discountPercentage: 5 }, 'amount', 10000);
check('generated text names points', described.includes('100 points'), described);
check('generated text names the discount', described.includes('5% discount'), described);
check('generated text names the measured value', described.includes('10,000'), described);
check(
  'units basis is described in units',
  describeReward({ points: 5 }, 'units', 40).includes('40 units')
);
eq('a valueless reward describes as empty', describeReward({}, 'amount', 0), '');

// ---------------------------------------------------------------------------
section('end-to-end: the exact bug that made this path dead');
// ---------------------------------------------------------------------------
// Regression guard. The old service filtered on `status: 'active'`, a field the
// Points schema has never had, so the query matched nothing and auto-apply never
// fired. Nothing below may reintroduce a `status` dependency.
const live = purchaseScheme({
  schemeCode: 'PUR-001',
  validFrom: new Date('2026-01-01'),
  validTo: new Date('2026-12-31'),
  autoApplyGRN: true
});
check('no status field is required to be live', !('status' in live));
check(
  'a live scheme with a matching line qualifies',
  itemMatchesScope(live, line()) && resolvePurchaseSlab(slabsFor(live), measurePurchaseItems([line()], 'amount')) !== null
);
const bigLine = line({ acceptedQuantity: 100, unitPrice: 1000 });
eq('a large purchase reaches the top tier', resolvePurchaseSlab(slabsFor(live), measurePurchaseItems([bigLine], 'amount')).seq, 2);
eq(
  'and pays the top tier reward, not the sum of tiers',
  computeSlabReward(resolvePurchaseSlab(slabsFor(live), 100000), 100000).points,
  600
);

// ---------------------------------------------------------------------------
section('evaluatePurchaseSchemes — full path against a stubbed connection');
// ---------------------------------------------------------------------------
// The evaluator reads through `dbConnection.models.Points`, so a stub can stand
// in for the tenant connection. This exercises the whole flow — scope filter,
// measure, slab resolve, reward compute, roll-up — with no MongoDB.

const stubConnection = (schemes) => {
  const filters = [];
  return {
    filters,
    models: {
      Points: {
        find: async (filter) => {
          filters.push(filter);
          return schemes;
        }
      }
    },
    model: () => { throw new Error('stub must not create a model'); }
  };
};

const grnScheme = (overrides = {}) => ({
  _id: 'scheme-1',
  type: 'purchase',
  schemeCode: 'PUR-001',
  schemeName: 'Diwali Purchase Offer',
  brand: BRAND_A,
  category: CAT_1,
  subcategory: SUB_X,
  calculationType: 'amount',
  autoApplyGRN: true,
  validFrom: new Date('2026-01-01'),
  validTo: new Date('2026-12-31'),
  slabs: [
    { seq: 1, from: 10000, to: 49999, label: 'Tier 1', reward: { points: 100 } },
    { seq: 2, from: 50000, to: null, label: 'Tier 2', reward: { points: 600, extraQuantity: 2 } }
  ],
  ...overrides
});

// The regression that mattered: the old query filtered on `status`, a field the
// Points schema has never had, so it matched nothing and auto-apply never fired.
const conn = stubConnection([grnScheme()]);
const result = await schemeService.evaluatePurchaseSchemes(conn, {
  items: [line({ acceptedQuantity: 60, unitPrice: 1000 })],
  autoApplyField: 'autoApplyGRN'
});

check('the query never filters on a status field', !('status' in conn.filters[0]), JSON.stringify(conn.filters[0]));
eq('query targets purchase schemes', conn.filters[0].type, 'purchase');
eq('query honours the GRN auto-apply flag', conn.filters[0].autoApplyGRN, true);
check('query bounds validity with validFrom/validTo', 'validFrom' in conn.filters[0] && 'validTo' in conn.filters[0]);
check('query does not filter on a supplier field', !('supplier' in conn.filters[0]));

eq('one scheme qualified', result.schemes.length, 1);
eq('the top slab was selected', result.schemes[0].slabSeq, 2);
eq('the top slab label is carried', result.schemes[0].slabLabel, 'Tier 2');
eq('measured value is qty x price', result.schemes[0].measuredValue, 60000);
eq('points roll up', result.totalPoints, 600);
eq('extra quantity rolls up', result.totalExtraQuantity, 2);
eq('no discount was configured', result.totalDiscountAmount, 0);
check('points are NOT added into the money total', result.totalMonetaryValue === 0);
check('the audit description is populated', result.schemes[0].description.length > 0, result.schemes[0].description);
eq('scheme code is carried through', result.schemes[0].schemeCode, 'PUR-001');

// A line whose scope does not match must not pay out.
const offScope = await schemeService.evaluatePurchaseSchemes(stubConnection([grnScheme()]), {
  items: [line({ subcategory: SUB_Y, acceptedQuantity: 60, unitPrice: 1000 })],
  autoApplyField: 'autoApplyGRN'
});
eq('an off-scope line qualifies nothing', offScope.schemes.length, 0);
eq('and rolls up to zero', offScope.totalPoints, 0);

// Below the lowest tier nothing pays.
const tooSmall = await schemeService.evaluatePurchaseSchemes(stubConnection([grnScheme()]), {
  items: [line({ acceptedQuantity: 1, unitPrice: 1000 })],
  autoApplyField: 'autoApplyGRN'
});
eq('a purchase below the first tier pays nothing', tooSmall.schemes.length, 0);

// No schemes configured at all.
const none = await schemeService.evaluatePurchaseSchemes(stubConnection([]), {
  items: [line()], autoApplyField: 'autoApplyGRN'
});
eq('no schemes -> no payouts', none.schemes.length, 0);
eq('no schemes -> zero totals', none.totalMonetaryValue, 0);

// Money rewards do roll into the monetary total; points do not.
const moneyScheme = grnScheme({
  slabs: [{ seq: 1, from: 0, to: null, label: 'Flat', reward: { points: 500, discountPercentage: 10, cashbackAmount: 250 } }]
});
const money = await schemeService.evaluatePurchaseSchemes(stubConnection([moneyScheme]), {
  items: [line({ acceptedQuantity: 10, unitPrice: 1000 })],
  autoApplyField: 'autoApplyGRN'
});
eq('discount is 10% of 10,000', money.totalDiscountAmount, 1000);
eq('cashback is passed through', money.totalCashbackAmount, 250);
eq('points are reported separately', money.totalPoints, 500);
eq('money total excludes points', money.totalMonetaryValue, 1250);

// Two schemes both matching should both pay.
const two = await schemeService.evaluatePurchaseSchemes(
  stubConnection([grnScheme({ _id: 's1' }), grnScheme({ _id: 's2', schemeCode: 'PUR-002' })]),
  { items: [line({ acceptedQuantity: 60, unitPrice: 1000 })], autoApplyField: 'autoApplyGRN' }
);
eq('both matching schemes pay', two.schemes.length, 2);
eq('points from both roll up', two.totalPoints, 1200);

// The supplier-invoice path uses the same evaluator with the other flag.
const invConn = stubConnection([grnScheme()]);
await schemeService.checkAndApplyPurchaseSchemes(invConn, { items: [line()] });
eq('invoice path queries autoApplySupplierInvoice', invConn.filters[0].autoApplySupplierInvoice, true);
check('invoice path does not set the GRN flag', !('autoApplyGRN' in invConn.filters[0]));

// A missing connection must fail soft, not throw.
const noConn = await schemeService.evaluatePurchaseSchemes(null, { items: [line()] });
eq('a missing connection returns an empty result', noConn.schemes.length, 0);

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
