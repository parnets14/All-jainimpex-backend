import {
  normalizeLine,
  lineMatchesScope,
  resolveSlab,
  resolveNextSlab,
  evaluateMixGroups,
  measureLines,
  evaluateSchemes,
  schemeIsLive,
  dealerMatchesScope,
  resolveFreeItemProduct,
  evaluateProductSlabs,
  slabsUsePaymentTerms,
  slabMatchesPaymentTerms
} from './schemeEngine.js';

let passed = 0;
let failed = 0;

const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}\n      expected ${e}\n      actual   ${a}`); }
};

console.log('\n--- resolveSlab: highest qualifying only, never additive ---');
const slabs = [
  { seq: 1, from: 5, to: 9, reward: { type: 'freeItem', freeItemQuantity: 1 } },
  { seq: 2, from: 10, to: 19, reward: { type: 'freeItem', freeItemQuantity: 2 } },
  { seq: 3, from: 20, to: null, reward: { type: 'freeItem', freeItemQuantity: 4 } }
];
check('4 pcs -> none', resolveSlab(slabs, 4), null);
check('5 pcs -> slab 1', resolveSlab(slabs, 5)?.seq, 1);
check('9 pcs -> slab 1', resolveSlab(slabs, 9)?.seq, 1);
check('10 pcs -> slab 2', resolveSlab(slabs, 10)?.seq, 2);
check('20 pcs -> slab 3 (not 1+2+3)', resolveSlab(slabs, 20)?.seq, 3);
check('5000 pcs -> slab 3 open ended', resolveSlab(slabs, 5000)?.seq, 3);
check('slab reward qty at 20', resolveSlab(slabs, 20)?.reward.freeItemQuantity, 4);

console.log('\n--- resolveSlab: amount slabs ---');
const amountSlabs = [
  { seq: 1, from: 20000, to: 49999, reward: { type: 'points', points: 100 } },
  { seq: 2, from: 50000, to: 99999, reward: { type: 'points', points: 300 } },
  { seq: 3, from: 100000, to: null, reward: { type: 'points', points: 800 } }
];
check('19999 -> none', resolveSlab(amountSlabs, 19999), null);
check('20000 -> 100 pts', resolveSlab(amountSlabs, 20000)?.reward.points, 100);
check('49999 -> 100 pts', resolveSlab(amountSlabs, 49999)?.reward.points, 100);
check('50000 -> 300 pts', resolveSlab(amountSlabs, 50000)?.reward.points, 300);
check('100000 -> 800 pts', resolveSlab(amountSlabs, 100000)?.reward.points, 800);

console.log('\n--- resolveNextSlab (Sales Order hint) ---');
check('at 5 -> next is 10', resolveNextSlab(slabs, 5)?.from, 10);
check('at 7 -> next is 10', resolveNextSlab(slabs, 7)?.from, 10);
check('at 20 -> none', resolveNextSlab(slabs, 20), null);
check('at 0 -> next is 5', resolveNextSlab(slabs, 0)?.from, 5);

console.log('\n--- CD and Regular must BOTH count (salesType ignored) ---');
const brandScope = { level: 'brand', brand: 'BRAND_CERA' };
const regularLine = { productId: 'P1', brandId: 'BRAND_CERA', salesType: 'Regular Sale', quantity: 6, unitPrice: 1000 };
const cdLine = { productId: 'P2', brandId: 'BRAND_CERA', salesType: 'CD Sales', quantity: 4, unitPrice: 1000 };
check('Regular CERA line matches brand scope', lineMatchesScope(regularLine, brandScope), true);
check('CD CERA line matches brand scope', lineMatchesScope(cdLine, brandScope), true);
check('6 Regular + 4 CD = 10 pcs', measureLines([regularLine, cdLine], 'quantity'), 10);
check('resolves to slab 2 at 10 pcs', resolveSlab(slabs, 10)?.seq, 2);

console.log('\n--- 5 pcs on 10 Oct + 5 pcs on 12 Oct = 10 -> 1 free ---');
const schemeMixed = {
  _id: 'SCH1',
  schemeCode: 'CERA-MS-2026-01',
  schemeName: 'CERA Monsoon',
  appliesTo: 'dealer',
  status: 'Active',
  validFrom: new Date('2026-10-01'),
  validTo: new Date('2026-10-30'),
  scope: brandScope,
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  slabs: [
    { seq: 1, from: 10, to: null, reward: { type: 'freeItem', freeItemQuantity: 1 } }
  ],
  priority: 0
};
const dealer = { _id: 'D1', dealerType: 'Retailer' };

const first5 = evaluateSchemes({
  schemes: [schemeMixed], dealer,
  lines: [{ ...regularLine, quantity: 5 }],
  at: new Date('2026-10-10')
});
check('day1: 5 pcs, not yet eligible', first5[0].measuredValue, 5);
check('day1: no slab', first5[0].slab, null);
check('day1: next slab at 10', first5[0].nextSlab?.from, 10);

const second5 = evaluateSchemes({
  schemes: [schemeMixed], dealer,
  lines: [{ ...cdLine, quantity: 5 }],
  at: new Date('2026-10-12'),
  existingProgressByScheme: { SCH1: 5 }
});
check('day2: banked 5 + new 5 = 10', second5[0].measuredValue, 10);
check('day2: slab 1 achieved', second5[0].slab?.seq, 1);
check('day2: 1 free', second5[0].slab?.reward.freeItemQuantity, 1);

console.log('\n--- validity window ---');
check('inside window', schemeIsLive(schemeMixed, new Date('2026-10-15')), true);
check('before window', schemeIsLive(schemeMixed, new Date('2026-09-30')), false);
check('after window', schemeIsLive(schemeMixed, new Date('2026-10-31')), false);

console.log('\n--- per-invoice accumulation does NOT bank ---');
const perInvoice = { ...schemeMixed, condition: { basis: 'quantity', accumulation: 'perInvoice' } };
const pi = evaluateSchemes({
  schemes: [perInvoice], dealer,
  lines: [{ ...cdLine, quantity: 5 }],
  at: new Date('2026-10-12'),
  existingProgressByScheme: { SCH1: 5 }
});
check('perInvoice ignores banked value', pi[0].measuredValue, 5);
check('perInvoice -> no slab at 5', pi[0].slab, null);

console.log('\n--- mix scope: every group minimum must be met ---');
const mixScheme = {
  ...schemeMixed,
  scope: {
    level: 'mix',
    mixGroups: [
      { groupName: 'Group A', brand: 'BRAND_A', minQuantity: 5 },
      { groupName: 'Group B', brand: 'BRAND_B', minQuantity: 5 }
    ]
  }
};
const onlyA = evaluateMixGroups(mixScheme.scope, [
  { ...normalizeLine({ brandId: 'BRAND_A', quantity: 5 }) }
]);
check('only Group A -> not satisfied', onlyA.satisfied, false);
const bothAB = evaluateMixGroups(mixScheme.scope, [
  { ...normalizeLine({ brandId: 'BRAND_A', quantity: 5 }) },
  { ...normalizeLine({ brandId: 'BRAND_B', quantity: 5 }) }
]);
check('A=5 + B=5 -> satisfied', bothAB.satisfied, true);

console.log('\n--- dealer targeting ---');
check('all dealers when scope empty', dealerMatchesScope({ _id: 'D1' }, {}), true);
check('dealerType mismatch blocked', dealerMatchesScope(
  { _id: 'D1', dealerType: 'Retailer' }, { dealerTypes: ['Distributor'] }), false);
check('dealerType match allowed', dealerMatchesScope(
  { _id: 'D1', dealerType: 'Retailer' }, { dealerTypes: ['Retailer'] }), true);
check('explicit dealer list match', dealerMatchesScope(
  { _id: 'D1' }, { dealers: ['D1'] }), true);
check('explicit dealer list miss', dealerMatchesScope(
  { _id: 'D9' }, { dealers: ['D1'] }), false);

console.log('\n--- free item rules ---');
const linesForFree = [
  { productId: 'A', productName: 'A', unitPrice: 500 },
  { productId: 'B', productName: 'B', unitPrice: 1500 },
  { productId: 'C', productName: 'C', unitPrice: 900 }
];
check('lowestPrice picks cheapest',
  resolveFreeItemProduct({ reward: { freeItemRule: 'lowestPrice' } }, linesForFree)?.productId, 'A');
check('sameProduct picks dearest',
  resolveFreeItemProduct({ reward: { freeItemRule: 'sameProduct' } }, linesForFree)?.productId, 'B');
check('specificProduct honoured',
  resolveFreeItemProduct(
    { reward: { freeItemRule: 'specificProduct', freeItemProduct: 'C' } }, linesForFree)?.productId, 'C');

console.log('\n--- line normalization from invoice-shaped line ---');
const norm = normalizeLine({
  product: { _id: 'P9', itemName: 'Basin', productCode: 'B-9', brand: { _id: 'BR9' } },
  quantity: 3, unitPrice: 200
});
check('normalized productId', norm.productId, 'P9');
check('normalized name', norm.productName, 'Basin');
check('normalized amount', norm.amount, 600);

// ---------------------------------------------------------------------------
// ACCEPTANCE / REGRESSION SUITE for the expansion spec (items 1-13)
// ---------------------------------------------------------------------------

console.log('\n=== item 12 / 2: slab-based amount ladder ===');
const amountLadder = [
  { seq: 1, from: 20000, to: 49999, reward: { type: 'points', points: 100 } },
  { seq: 2, from: 50000, to: 99999, reward: { type: 'points', points: 300 } },
  { seq: 3, from: 100000, to: null, reward: { type: 'points', points: 800 } }
];
check('20,000 -> 100 pts', resolveSlab(amountLadder, 20000)?.reward.points, 100);
check('50,000 -> 300 pts', resolveSlab(amountLadder, 50000)?.reward.points, 300);
check('1,00,000 -> 800 pts', resolveSlab(amountLadder, 100000)?.reward.points, 800);
check('slabs never stack (1,00,000 is 800 not 1200)',
  resolveSlab(amountLadder, 100000)?.reward.points, 800);

console.log('\n=== item 1: Product Mix - same product ===');
const sameProductSlabs = [
  { seq: 1, from: 5, to: 9, reward: { type: 'freeItem', freeItemQuantity: 1, freeItemRule: 'sameProduct' } },
  { seq: 2, from: 10, to: null, reward: { type: 'freeItem', freeItemQuantity: 2, freeItemRule: 'sameProduct' } }
];
check('Buy 5 of A -> 1 A free', resolveSlab(sameProductSlabs, 5)?.reward.freeItemQuantity, 1);
check('Buy 10 of A -> 2 A free', resolveSlab(sameProductSlabs, 10)?.reward.freeItemQuantity, 2);

console.log('\n=== item 1: Product Mix - mixed products, free-item rules ===');
const mixLines = [
  { productId: 'A', productName: 'A', unitPrice: 1000, quantity: 1, amount: 1000 },
  { productId: 'B', productName: 'B', unitPrice: 400, quantity: 1, amount: 400 },
  { productId: 'C', productName: 'C', unitPrice: 700, quantity: 1, amount: 700 }
];
check('lowestPrice -> B (cheapest)',
  resolveFreeItemProduct({ reward: { freeItemRule: 'lowestPrice' } }, mixLines)?.productId, 'B');
check('equalOrLower -> B (cheapest, never above highest)',
  resolveFreeItemProduct({ reward: { freeItemRule: 'equalOrLower' } }, mixLines)?.productId, 'B');
check('specificProduct -> C',
  resolveFreeItemProduct(
    { reward: { freeItemRule: 'specificProduct', freeItemProduct: 'C' } }, mixLines)?.productId, 'C');
check('sameProduct -> A (dearest repeat)',
  resolveFreeItemProduct({ reward: { freeItemRule: 'sameProduct' } }, mixLines)?.productId, 'A');

console.log('\n=== items 4/5/6: brand | category | subcategory are ONE mechanism ===');
check('brand scope matches brand line',
  lineMatchesScope({ brandId: 'BR1' }, { level: 'brand', brand: 'BR1' }), true);
check('category scope matches category line',
  lineMatchesScope({ categoryId: 'CA1' }, { level: 'category', category: 'CA1' }), true);
check('subcategory scope matches subcategory line',
  lineMatchesScope({ subcategoryId: 'SC1' }, { level: 'subcategory', subcategory: 'SC1' }), true);
check('brand scope rejects a different brand',
  lineMatchesScope({ brandId: 'BR2' }, { level: 'brand', brand: 'BR1' }), false);

console.log('\n=== item 7: Selected Products ===');
const selectedScope = { level: 'product', products: ['A', 'B', 'C', 'D'] };
check('selected product A matches', lineMatchesScope({ productId: 'A' }, selectedScope), true);
check('selected product D matches', lineMatchesScope({ productId: 'D' }, selectedScope), true);
check('unselected product Z is excluded', lineMatchesScope({ productId: 'Z' }, selectedScope), false);

console.log('\n=== item 8: Product Mix groups - BOTH must be achieved ===');
const groupScope = {
  level: 'mix',
  mixGroups: [
    { groupName: 'A', category: 'c1', minQuantity: 5 },
    { groupName: 'B', category: 'c2', minQuantity: 10 }
  ]
};
check('both groups met -> satisfied',
  evaluateMixGroups(groupScope, [
    { categoryId: 'c1', quantity: 5, amount: 50 },
    { categoryId: 'c2', quantity: 10, amount: 100 }
  ], 'quantity').satisfied, true);
check('only one group met -> NOT satisfied',
  evaluateMixGroups(groupScope, [
    { categoryId: 'c1', quantity: 9, amount: 90 },
    { categoryId: 'c2', quantity: 4, amount: 40 }
  ], 'quantity').satisfied, false);
check('A+B+C min 20 total -> satisfied',
  evaluateMixGroups({
    level: 'mix',
    mixGroups: [{ groupName: 'All', products: ['A', 'B', 'C'], minQuantity: 20 }]
  }, [
    { productId: 'A', quantity: 8, amount: 80 },
    { productId: 'B', quantity: 7, amount: 70 },
    { productId: 'C', quantity: 5, amount: 50 }
  ], 'quantity').satisfied, true);

console.log('\n=== item 9: Ratio ===');
const ratioScope = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Pipes', category: 'pipes', ratioPercentage: 50 },
    { groupName: 'Fittings', category: 'fittings', ratioPercentage: 50 }
  ]
};
check('50/50 met when evenly split',
  evaluateMixGroups(ratioScope, [
    { categoryId: 'pipes', quantity: 50, amount: 5000 },
    { categoryId: 'fittings', quantity: 50, amount: 5000 }
  ], 'amount').satisfied, true);
const ratioFail = evaluateMixGroups(ratioScope, [
  { categoryId: 'pipes', quantity: 90, amount: 9000 },
  { categoryId: 'fittings', quantity: 10, amount: 1000 }
], 'amount');
check('50/50 fails when one side is only 10%', ratioFail.satisfied, false);
check('share computed for pipes', Math.round(ratioFail.groups[0].sharePercentage), 90);
check('share computed for fittings', Math.round(ratioFail.groups[1].sharePercentage), 10);

const ratio7030 = {
  level: 'mix',
  mixGroups: [
    { groupName: 'Cat A', category: 'ca', ratioPercentage: 70 },
    { groupName: 'Cat B', category: 'cb', ratioPercentage: 30 }
  ]
};
check('70/30 met at 70/30 split',
  evaluateMixGroups(ratio7030, [
    { categoryId: 'ca', quantity: 70, amount: 7000 },
    { categoryId: 'cb', quantity: 30, amount: 3000 }
  ], 'amount').satisfied, true);
check('70/30 fails at a 50/50 split',
  evaluateMixGroups(ratio7030, [
    { categoryId: 'ca', quantity: 50, amount: 5000 },
    { categoryId: 'cb', quantity: 50, amount: 5000 }
  ], 'amount').satisfied, false);
check('ratio weights normalise (70/30 acts like 70%/30%)',
  evaluateMixGroups(ratio7030, [
    { categoryId: 'ca', quantity: 70, amount: 7000 },
    { categoryId: 'cb', quantity: 30, amount: 3000 }
  ], 'amount').groups[0].requiredShare, 70);

console.log('\n=== item 10: Cumulative purchase ===');
const cumulativeScheme = {
  _id: 'cum1',
  schemeCode: 'CUM',
  appliesTo: 'dealer',
  status: 'Active',
  validFrom: new Date(Date.now() - 86400000),
  validTo: new Date(Date.now() + 86400000),
  priority: 0,
  scope: { level: 'all' },
  condition: { basis: 'amount', accumulation: 'cumulative' },
  slabs: [{ seq: 1, from: 20000, to: null, reward: { type: 'points', points: 100 } }]
};
const cumEval = evaluateSchemes({
  schemes: [cumulativeScheme],
  dealer: {},
  lines: [{ productId: 'P', quantity: 1, unitPrice: 8000, amount: 8000 }],
  existingProgressByScheme: { cum1: 13000 }
});
check('7,000 + 6,000 + 8,000 = 21,000 qualifies',
  cumEval[0]?.eligible, true);
check('cumulative measured value', cumEval[0]?.measuredValue, 21000);

console.log('\n=== item 3: per-product ladders (each product own slabs) ===');
const productLadders = [
  {
    product: 'pA',
    label: 'Product A',
    slabs: [
      { seq: 1, from: 5, to: 9, reward: { type: 'freeItem', freeItemQuantity: 1 } },
      { seq: 2, from: 10, to: null, reward: { type: 'freeItem', freeItemQuantity: 2 } }
    ]
  },
  {
    product: 'pB',
    label: 'Product B',
    slabs: [
      { seq: 1, from: 10, to: 19, reward: { type: 'freeItem', freeItemQuantity: 1 } },
      { seq: 2, from: 20, to: null, reward: { type: 'freeItem', freeItemQuantity: 3 } }
    ]
  }
];
const perProduct = evaluateProductSlabs(productLadders, [
  { productId: 'pA', quantity: 12, amount: 1200 },
  { productId: 'pB', quantity: 11, amount: 1100 }
], { basis: 'quantity' });
check('Product A qty 12 -> its own slab 2', perProduct[0].slab?.seq, 2);
check('Product A -> 2 free', perProduct[0].slab?.reward.freeItemQuantity, 2);
check('Product B qty 11 -> its own slab 1', perProduct[1].slab?.seq, 1);
check('Product B -> 1 free', perProduct[1].slab?.reward.freeItemQuantity, 1);
check('Product A measured only on A lines', perProduct[0].measuredValue, 12);
check('Product B measured only on B lines', perProduct[1].measuredValue, 11);

const perProductNone = evaluateProductSlabs(productLadders, [
  { productId: 'pA', quantity: 4, amount: 400 }
], { basis: 'quantity' });
check('Product A qty 4 -> no slab', perProductNone[0].slab, null);
check('Product B absent -> no slab', perProductNone[1].slab, null);

console.log('\n=== item 11: Purchase + payment condition (parallel ladders) ===');
const paymentSlabs = [
  { seq: 1, from: 5, to: 7, paymentTerms: { label: 'Immediate', fromCreditDays: 0, toCreditDays: 0 }, reward: { type: 'freeItem', freeItemQuantity: 1 } },
  { seq: 2, from: 8, to: 14, paymentTerms: { label: '30 Days', fromCreditDays: 30, toCreditDays: null }, reward: { type: 'freeItem', freeItemQuantity: 1 } },
  { seq: 3, from: 15, to: null, paymentTerms: { label: '30 Days', fromCreditDays: 30, toCreditDays: null }, reward: { type: 'freeItem', freeItemQuantity: 2 } }
];
check('immediate, qty 6 -> 1 free', resolveSlab(paymentSlabs, 6, 0)?.reward.freeItemQuantity, 1);
check('immediate, qty 10 -> no reward (that rung is credit-only)', resolveSlab(paymentSlabs, 10, 0), null);
check('30-day credit, qty 10 -> 1 free', resolveSlab(paymentSlabs, 10, 30)?.reward.freeItemQuantity, 1);
check('30-day credit, qty 20 -> 2 free', resolveSlab(paymentSlabs, 20, 30)?.reward.freeItemQuantity, 2);
check('slabsUsePaymentTerms detects targeting', slabsUsePaymentTerms(paymentSlabs), true);
check('plain ladder is not payment-targeted',
  slabsUsePaymentTerms([{ seq: 1, from: 5, to: null, reward: {} }]), false);
check('untargeted slab passes under any terms',
  slabMatchesPaymentTerms({ paymentTerms: { fromCreditDays: 0, toCreditDays: null } }, 999), true);

console.log('\n=== items 2+13: purchase amount ladder and points ladder are the same tool ===');
const pointsLadder = [
  { seq: 1, from: 10000, to: 24999, reward: { type: 'points', points: 100 } },
  { seq: 2, from: 25000, to: 49999, reward: { type: 'points', points: 300 } },
  { seq: 3, from: 50000, to: null, reward: { type: 'points', points: 700 } }
];
check('10,000 -> 100 points', resolveSlab(pointsLadder, 10000)?.reward.points, 100);
check('25,000 -> 300 points', resolveSlab(pointsLadder, 25000)?.reward.points, 300);
check('50,000 -> 700 points', resolveSlab(pointsLadder, 50000)?.reward.points, 700);

console.log('\n=== regression: raw (un-normalized) lines must not measure zero ===');
const rawEval = evaluateSchemes({
  schemes: [cumulativeScheme],
  dealer: {},
  lines: [{ productId: 'P', quantity: 1, mrp: 8000 }],
  existingProgressByScheme: { cum1: 13000 }
});
check('raw mrp line measures 8000 not 0', rawEval[0]?.thisDocumentValue, 8000);
check('normalized line measures the same', evaluateSchemes({
  schemes: [cumulativeScheme],
  dealer: {},
  lines: [{ productId: 'P', quantity: 1, unitPrice: 8000, amount: 8000 }],
  existingProgressByScheme: { cum1: 13000 }
})[0]?.thisDocumentValue, 8000);

console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
