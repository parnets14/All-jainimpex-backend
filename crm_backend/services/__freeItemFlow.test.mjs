import assert from 'node:assert/strict';
import {
  computeScaledReward,
  resolveFreeItemProduct,
  previewSchemesForLines,
  commitInvoiceAchievements,
  evaluateSchemes,
  normalizeLine
} from './schemeEngine.js';

let passed = 0;
let failed = 0;
const test = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(err);
    process.exitCode = 1;
  }
};

const asyncTest = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(err);
    process.exitCode = 1;
  }
};

console.log('\n--- 1. computeScaledReward: allowRepeat multiplier & percentage conversion ---');

test('scales reward with allowRepeat multiplier based on measuredValue / slabFrom', () => {
  const baseReward = {
    type: 'freeItem',
    freeItemQuantity: 1,
    points: 10,
    amount: 100,
    percentage: 0
  };

  const scaled = computeScaledReward(baseReward, {
    allowRepeat: true,
    slabFrom: 10,
    measuredValue: 25
  });

  assert.equal(scaled.multiplier, 2);
  assert.equal(scaled.freeItemQuantity, 2);
  assert.equal(scaled.points, 20);
  assert.equal(scaled.amount, 200);
});

test('multiplier is 1 when allowRepeat is false', () => {
  const baseReward = {
    type: 'freeItem',
    freeItemQuantity: 1,
    points: 10,
    amount: 100
  };

  const scaled = computeScaledReward(baseReward, {
    allowRepeat: false,
    slabFrom: 10,
    measuredValue: 50
  });

  assert.equal(scaled.multiplier, 1);
  assert.equal(scaled.freeItemQuantity, 1);
  assert.equal(scaled.points, 10);
  assert.equal(scaled.amount, 100);
});

test('calculates rupee amount from percentage on measuredValue', () => {
  const baseReward = {
    type: 'creditNote',
    percentage: 5,
    amount: 0
  };

  const scaled = computeScaledReward(baseReward, {
    allowRepeat: false,
    slabFrom: 10000,
    measuredValue: 20000
  });

  assert.equal(scaled.amount, 1000); // 5% of 20000
  assert.equal(scaled.percentage, 5);
});

test('combines base fixed amount and percentage on measuredValue', () => {
  const baseReward = {
    type: 'discount',
    percentage: 10,
    amount: 500
  };

  const scaled = computeScaledReward(baseReward, {
    allowRepeat: false,
    slabFrom: 5000,
    measuredValue: 10000
  });

  assert.equal(scaled.amount, 1500); // 500 fixed + (10% of 10000)
});

test('a percentage on a QUANTITY scheme uses the rupee value of the goods', () => {
  // "Buy 20 pcs get 5%": 20 pieces @ ₹100 = ₹2,000 of goods, so 5% = ₹100.
  // Against the raw piece count it paid 20 x 5% = ₹1 — a 100x under-payment.
  const scaled = computeScaledReward(
    { type: 'discount', percentage: 5 },
    { allowRepeat: false, slabFrom: 20, measuredValue: 20, basis: 'quantity', monetaryValue: 2000 }
  );
  assert.equal(scaled.amount, 100);
});

test('an AMOUNT scheme keeps using measuredValue (already money)', () => {
  const scaled = computeScaledReward(
    { type: 'discount', percentage: 5 },
    { allowRepeat: false, slabFrom: 1000, measuredValue: 2000, basis: 'amount', monetaryValue: 2000 }
  );
  assert.equal(scaled.amount, 100);
});

test('a caller that passes no monetaryValue keeps the legacy behaviour', () => {
  const scaled = computeScaledReward(
    { type: 'creditNote', percentage: 5 },
    { slabFrom: 10000, measuredValue: 20000 }
  );
  assert.equal(scaled.amount, 1000); // 5% of 20000
});

console.log('\n--- 2. resolveFreeItemProduct: resolves product info correctly ---');

test('resolves sameProduct to dearest qualifying line', () => {
  const slab = {
    reward: {
      type: 'freeItem',
      freeItemQuantity: 1,
      freeItemRule: 'sameProduct'
    }
  };

  const lines = [
    { productId: 'p1', productName: 'Item A', productCode: 'A01', unitPrice: 100 },
    { productId: 'p2', productName: 'Item B', productCode: 'B01', unitPrice: 250 }
  ];

  const resolved = resolveFreeItemProduct(slab, lines);
  assert.equal(resolved.productId, 'p2');
  assert.equal(resolved.productName, 'Item B');
  assert.equal(resolved.productCode, 'B01');
  assert.equal(resolved.unitPrice, 250);
});

test('resolves lowestPrice to cheapest qualifying line', () => {
  const slab = {
    reward: {
      type: 'freeItem',
      freeItemQuantity: 1,
      freeItemRule: 'lowestPrice'
    }
  };

  const lines = [
    { productId: 'p1', productName: 'Item A', productCode: 'A01', unitPrice: 100 },
    { productId: 'p2', productName: 'Item B', productCode: 'B01', unitPrice: 250 }
  ];

  const resolved = resolveFreeItemProduct(slab, lines);
  assert.equal(resolved.productId, 'p1');
  assert.equal(resolved.productName, 'Item A');
  assert.equal(resolved.productCode, 'A01');
});

test('resolves specificProduct from populated object on reward', () => {
  const slab = {
    reward: {
      type: 'freeItem',
      freeItemQuantity: 1,
      freeItemRule: 'specificProduct',
      freeItemProduct: {
        _id: 'pSpecial',
        itemName: 'Promo Cap',
        productCode: 'PROMO-01',
        mrp: 150
      }
    }
  };

  const lines = [
    { productId: 'p1', productName: 'Item A', productCode: 'A01', unitPrice: 100 }
  ];

  const resolved = resolveFreeItemProduct(slab, lines);
  assert.equal(resolved.productId, 'pSpecial');
  assert.equal(resolved.productName, 'Promo Cap');
  assert.equal(resolved.productCode, 'PROMO-01');
  assert.equal(resolved.unitPrice, 150);
});

console.log('\n--- 3. previewSchemesForLines: achievedSlab carries resolved freeItem ---');

await asyncTest('achievedSlab includes scaled reward and resolved freeItem', async () => {
  const scheme = {
    _id: 'sch1',
    schemeCode: 'BUY10GET1',
    schemeName: 'Buy 10 Get 1 Free',
    status: 'Active',
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    condition: { basis: 'quantity', accumulation: 'cumulative' },
    allowRepeat: true,
    slabs: [
      {
        seq: 1,
        from: 10,
        to: null,
        label: '10 pcs -> 1 free',
        reward: {
          type: 'freeItem',
          freeItemQuantity: 1,
          freeItemRule: 'sameProduct'
        }
      }
    ]
  };

  const dealer = { _id: 'd1', name: 'Ravi Traders' };

  const chainable = (rows) => {
    const node = {
      populate: () => node,
      session: () => node,
      select: () => node,
      lean: async () => rows
    };
    return node;
  };

  const stubConn = {
    models: {
      Dealer: { findById: () => chainable(dealer) },
      Scheme: { find: () => chainable([scheme]) },
      SchemeProgress: { find: () => chainable([]) },
      SchemeApplication: {},
      Product: { find: () => chainable([]) }
    },
    model: () => {}
  };

  const lines = [
    { productId: 'p1', productName: 'Pipe 25mm', productCode: 'PIPE-25', quantity: 22, unitPrice: 200 }
  ];

  const preview = await previewSchemesForLines(stubConn, { dealerId: 'd1', lines });
  assert.equal(preview.schemes.length, 1);
  const s = preview.schemes[0];
  assert.ok(s.eligible);
  assert.ok(s.achievedSlab);
  assert.equal(s.achievedSlab.reward.multiplier, 2); // 22 / 10 = 2 with allowRepeat
  assert.equal(s.achievedSlab.reward.freeItemQuantity, 2);
  assert.ok(s.achievedSlab.freeItem);
  assert.equal(s.achievedSlab.freeItem.productId, 'p1');
  assert.equal(s.achievedSlab.freeItem.productName, 'Pipe 25mm');
  assert.equal(s.achievedSlab.freeItem.productCode, 'PIPE-25');
});

// ---------------------------------------------------------------------------
// A scheme-granted free item is NOT a purchase.
//
// `evaluateSchemes` filters qualifying lines on `isSchemeFreeItem`, but the flag
// only reaches it if every mapper on the way in preserves it. `normalizeLine`
// rebuilds the line from an EXPLICIT field list, so an omitted field is silently
// lost — which made the filter a no-op and let the freebie inflate the dealer's
// measured total (order of 10 + its own 1 free item measured 11).
// ---------------------------------------------------------------------------

const FREE_SCHEME = {
  _id: 'schFree',
  schemeCode: 'BUY10GET1',
  schemeName: 'Buy 10 Get 1 Free',
  appliesTo: 'dealer',
  status: 'Active',
  redemptionMode: 'manual',
  allowRepeat: false,
  validFrom: new Date('2026-10-01T00:00:00Z'),
  validTo: new Date('2026-11-30T00:00:00Z'),
  scope: { level: 'all' },
  dealerScope: {},
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  slabs: [{
    seq: 1,
    from: 10,
    to: null,
    label: '10 pcs -> 1 free',
    reward: { type: 'freeItem', freeItemRule: 'lowestPrice', freeItemQuantity: 1 }
  }],
  productSlabs: []
};

const FREE_AT = new Date('2026-10-09T10:00:00Z');
const PAID_LINE = { productId: 'p-A', productCode: 'PA', productName: 'Pipe A', quantity: 10, unitPrice: 100 };
const FREE_LINE = {
  productId: 'p-FREE',
  productCode: 'FP',
  productName: 'Free Pipe',
  quantity: 1,
  unitPrice: 0,
  isSchemeFreeItem: true,
  schemeCode: 'BUY10GET1'
};

const runFree = (lines) => evaluateSchemes({
  schemes: [FREE_SCHEME],
  dealer: {},
  lines,
  at: FREE_AT,
  existingProgressByScheme: {}
})[0];

console.log('\n--- 4. a scheme-granted free item must not count as a purchase ---');

test('normalizeLine preserves isSchemeFreeItem (it rebuilds from a field list)', () => {
  const n = normalizeLine(FREE_LINE);
  assert.equal(n.isSchemeFreeItem, true);
  assert.equal(n.schemeCode, 'BUY10GET1');
});

test('a normal line is not marked as a free item', () => {
  assert.equal(normalizeLine(PAID_LINE).isSchemeFreeItem, false);
});

test('the freebie does NOT inflate the measured total', () => {
  assert.equal(runFree([PAID_LINE]).measuredValue, 10);
  // The regression: 10 paid + 1 scheme-granted free used to measure 11.
  assert.equal(runFree([PAID_LINE, FREE_LINE]).measuredValue, 10);
});

test('the freebie is excluded from the qualifying lines', () => {
  const r = runFree([PAID_LINE, FREE_LINE]);
  assert.equal(r.qualifyingLines.some((l) => l.productId === 'p-FREE'), false);
  assert.equal(r.qualifyingLines.length, 1);
});

test('a lowestPrice reward is not resolved to the 0-rupee freebie', () => {
  const bought = [PAID_LINE, FREE_LINE].map(normalizeLine).filter((l) => !l.isSchemeFreeItem);
  const resolved = resolveFreeItemProduct(FREE_SCHEME.slabs[0], bought);
  assert.equal(resolved.productId, 'p-A');
  assert.equal(resolved.unitPrice, 100);
});

await asyncTest('the invoice commit resolves the free item from PURCHASED lines only', async () => {
  const dealer = { _id: 'd1', name: 'Ravi Traders' };
  const bucket = {
    dealer: 'd1',
    scheme: 'schFree',
    basis: 'quantity',
    contributions: [],
    achievements: [],
    measuredQuantity: 0,
    measuredAmount: 0,
    allowRepeat: false,
    recomputeTotals() {
      const counted = this.contributions.filter((c) => c.counted !== false);
      this.measuredQuantity = counted.reduce((s, c) => s + Number(c.quantity || 0), 0);
      this.measuredAmount = counted.reduce((s, c) => s + Number(c.amount || 0), 0);
    },
    refreshNextSlab() {},
    async save() {}
  };

  const chainable = (rows) => {
    const node = {
      populate: () => node,
      session: () => node,
      select: () => node,
      sort: () => node,
      skip: () => node,
      limit: () => node,
      lean: async () => rows
    };
    return node;
  };

  // getSchemeModels() builds all five eagerly, so all five must exist or it
  // falls through to dbConnection.model() and throws.
  const conn = {
    models: {
      Dealer: { findById: () => chainable(dealer) },
      Scheme: { find: () => chainable([FREE_SCHEME]) },
      SchemeProgress: {
        find: () => chainable([]),
        findOne: async () => null,
        findOneAndUpdate: async () => bucket,
        updateOne: async () => ({ acknowledged: true })
      },
      SchemeApplication: {},
      Product: { find: () => chainable([]) }
    },
    model: () => { throw new Error('stub must not create a model'); }
  };

  const frozen = await commitInvoiceAchievements(conn, {
    dealerId: 'd1',
    invoiceId: 'inv1',
    documentNumber: 'INV-1',
    lines: [PAID_LINE, FREE_LINE],
    at: FREE_AT,
    schemeIds: ['schFree'],
    freeItemResolver: resolveFreeItemProduct
  });

  assert.equal(frozen.length, 1);
  assert.equal(frozen[0].rewardType, 'freeItem');
  assert.equal(frozen[0].measuredValue, 10);
  // The reward must be a product the dealer actually bought.
  assert.equal(frozen[0].resolvedFreeItem.productId, 'p-A');
  assert.notEqual(frozen[0].resolvedFreeItem.productId, 'p-FREE');
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
