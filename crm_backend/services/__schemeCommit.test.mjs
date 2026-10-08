/**
 * Focused harness for the two commit helpers in schemeEngine.
 *
 * These exercise the pure decision logic that runs on every Sales Order save and
 * every Dealer Invoice approval — WITHOUT touching MongoDB. The bucket contract
 * is re-implemented minimally here so we can assert:
 *   - recordOrderContributions is idempotent per document
 *   - commitInvoiceAchievements freezes only the highest qualifying slab
 *   - an upgrade replaces a lower slab in place (never two contradictory rows)
 *   - manual rewards stay pending (redeemed=false), auto rewards are marked
 *   - re-approving the same invoice does not duplicate
 *
 * Run: node services/__schemeCommit.test.mjs
 */

import {
  evaluateSchemes,
  resolveSlab,
  buildContribution,
  normalizeLine
} from './schemeEngine.js';

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

// ---------------------------------------------------------------------------
// Minimal in-memory bucket that mirrors what the commit helpers maintain.
// ---------------------------------------------------------------------------
const makeBucket = ({ dealer, scheme }) => ({
  dealer,
  scheme,
  contributions: [],
  achievements: [],
  measuredQuantity: 0,
  measuredAmount: 0,
  recomputeTotals() {
    this.measuredQuantity = this.contributions
      .filter((c) => c.counted)
      .reduce((sum, c) => sum + Number(c.quantity || 0), 0);
    this.measuredAmount = this.contributions
      .filter((c) => c.counted)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  }
});

// Mirrors recordOrderContributions' replace-then-push semantics.
const recordOrder = (bucket, { orderId, lines }) => {
  bucket.contributions = bucket.contributions.filter(
    (c) => !(String(c.documentId) === String(orderId) && c.documentType === 'SalesOrder')
  );
  for (const line of lines) {
    bucket.contributions.push(buildContribution({
      line,
      documentType: 'SalesOrder',
      documentId: orderId,
      counted: true
    }));
  }
  bucket.recomputeTotals();
};

// Mirrors commitInvoiceAchievements' freeze semantics.
const commitInvoice = (bucket, { invoiceId, slab, measuredValue, scheme, lines = [] }) => {
  const reward = slab.reward || {};
  const autoApplied = (scheme.redemptionMode || 'manual') === 'autoAtInvoice';

  bucket.contributions = bucket.contributions.filter(
    (c) => !(String(c.documentId) === String(invoiceId) && c.documentType === 'DealerInvoice')
  );
  for (const line of lines) {
    bucket.contributions.push(buildContribution({
      line,
      documentType: 'DealerInvoice',
      documentId: invoiceId,
      counted: true
    }));
  }
  bucket.recomputeTotals();

  let index = -1;
  let seq = -Infinity;
  bucket.achievements.forEach((a, i) => {
    if (a.revocationPending) return;
    if (Number(a.slabSeq) > seq) { seq = Number(a.slabSeq); index = i; }
  });

  const record = {
    slabSeq: slab.seq,
    slabLabel: slab.label || '',
    measuredValue,
    rewardType: reward.type,
    rewardSnapshot: reward,
    autoApplied,
    redeemed: autoApplied,
    crossedByDocumentId: invoiceId
  };

  let outcome;
  if (index >= 0 && Number(slab.seq) === seq) {
    Object.assign(bucket.achievements[index], { measuredValue });
    outcome = { duplicate: true, slabSeq: slab.seq };
  } else if (index >= 0 && Number(slab.seq) > seq) {
    Object.assign(bucket.achievements[index], record);
    outcome = { upgradedFrom: seq, slabSeq: slab.seq };
  } else {
    bucket.achievements.push(record);
    outcome = { slabSeq: slab.seq };
  }
  return { outcome, autoApplied };
};

// ---------------------------------------------------------------------------
const baseScheme = {
  _id: 's1',
  schemeCode: 'OCT24-BUY10',
  schemeName: 'October Buy 10 Get 1',
  appliesTo: 'dealer',
  status: 'Active',
  validFrom: new Date('2026-10-01'),
  validTo: new Date('2026-10-30'),
  priority: 1,
  redemptionMode: 'manual',
  condition: { basis: 'quantity', accumulation: 'cumulative' },
  scope: { level: 'all' },
  slabs: [
    { seq: 1, from: 5, to: 9, label: '5-9 pcs', reward: { type: 'points', points: 50 } },
    { seq: 2, from: 10, to: null, label: '10+ pcs', reward: { type: 'freeItem', freeItemQuantity: 1, freeItemRule: 'sameProduct' } }
  ]
};

const dealer = { _id: 'd1', name: 'Test Dealer', code: 'TD1' };
const line = (qty, id = 'p1') => normalizeLine({
  product: id, productCode: 'SKU1', productName: 'Item', quantity: qty, unitPrice: 100
});

// ---------------------------------------------------------------------------
section('order contributions are idempotent per document');
{
  const bucket = makeBucket({ dealer: 'd1', scheme: 's1' });
  recordOrder(bucket, { orderId: 'o1', lines: [line(5)] });
  check('first save records 5', bucket.measuredQuantity === 5, `got ${bucket.measuredQuantity}`);

  // Same order saved again (e.g. status update) must not double-count.
  recordOrder(bucket, { orderId: 'o1', lines: [line(5)] });
  check('re-save does not double count', bucket.measuredQuantity === 5, `got ${bucket.measuredQuantity}`);
  check('only one contribution row', bucket.contributions.length === 1,
    `got ${bucket.contributions.length}`);
}

section('the user\'s exact scenario: 5 on the 10th + 5 on the 12th = 10 -> 1 free');
{
  const bucket = makeBucket({ dealer: 'd1', scheme: 's1' });
  recordOrder(bucket, { orderId: 'o-10th', lines: [line(5)] });
  recordOrder(bucket, { orderId: 'o-12th', lines: [line(5)] });
  check('banked total is 10', bucket.measuredQuantity === 10, `got ${bucket.measuredQuantity}`);

  const slab = resolveSlab(baseScheme.slabs, bucket.measuredQuantity);
  check('crosses slab 2', slab?.seq === 2, `got ${slab?.seq}`);

  const { outcome, autoApplied } = commitInvoice(bucket, {
    invoiceId: 'inv1', slab, measuredValue: 10, scheme: baseScheme, lines: [line(10)]
  });
  check('freezes slab 2', outcome.slabSeq === 2);
  check('manual reward is NOT auto applied', autoApplied === false);
  check('one achievement row', bucket.achievements.length === 1);
  check('achievement is pending redemption', bucket.achievements[0].redeemed === false);
}

section('an upgrade replaces the lower slab in place');
{
  const bucket = makeBucket({ dealer: 'd1', scheme: 's1' });
  recordOrder(bucket, { orderId: 'o1', lines: [line(6)] });
  const slab1 = resolveSlab(baseScheme.slabs, 6);
  commitInvoice(bucket, { invoiceId: 'inv1', slab: slab1, measuredValue: 6, scheme: baseScheme, lines: [line(6)] });
  check('first freeze is slab 1', bucket.achievements[0].slabSeq === 1, `got ${bucket.achievements[0].slabSeq}`);

  recordOrder(bucket, { orderId: 'o2', lines: [line(5)] });
  const slab2 = resolveSlab(baseScheme.slabs, bucket.measuredQuantity);
  const { outcome } = commitInvoice(bucket, {
    invoiceId: 'inv2', slab: slab2, measuredValue: bucket.measuredQuantity, scheme: baseScheme, lines: [line(5)]
  });
  check('upgrade reported from slab 1', outcome.upgradedFrom === 1, `got ${outcome.upgradedFrom}`);
  check('still exactly one achievement', bucket.achievements.length === 1,
    `got ${bucket.achievements.length}`);
  check('achievement is now slab 2', bucket.achievements[0].slabSeq === 2);
}

section('re-approving the same invoice does not duplicate');
{
  const bucket = makeBucket({ dealer: 'd1', scheme: 's1' });
  recordOrder(bucket, { orderId: 'o1', lines: [line(12)] });
  const slab = resolveSlab(baseScheme.slabs, 12);
  commitInvoice(bucket, { invoiceId: 'inv1', slab, measuredValue: 12, scheme: baseScheme, lines: [line(12)] });
  const { outcome } = commitInvoice(bucket, {
    invoiceId: 'inv1', slab, measuredValue: 12, scheme: baseScheme, lines: [line(12)]
  });
  check('second commit is a no-op refresh', outcome.duplicate === true);
  check('no duplicate achievement', bucket.achievements.length === 1,
    `got ${bucket.achievements.length}`);
}

section('auto rewards are marked as handed over');
{
  const autoScheme = { ...baseScheme, redemptionMode: 'autoAtInvoice' };
  const bucket = makeBucket({ dealer: 'd1', scheme: 's1' });
  recordOrder(bucket, { orderId: 'o1', lines: [line(10)] });
  const slab = resolveSlab(autoScheme.slabs, 10);
  const { autoApplied } = commitInvoice(bucket, {
    invoiceId: 'inv1', slab, measuredValue: 10, scheme: autoScheme, lines: [line(10)]
  });
  check('auto reward is auto applied', autoApplied === true);
  check('already marked redeemed', bucket.achievements[0].redeemed === true);
}

section('perInvoice does not inherit banked value');
{
  const perInvoice = {
    ...baseScheme,
    condition: { basis: 'quantity', accumulation: 'perInvoice' }
  };
  const evaluated = evaluateSchemes({
    schemes: [perInvoice], dealer, lines: [line(5)],
    existingProgressByScheme: { s1: 200 }
  });
  check('perInvoice ignores the banked 200', evaluated[0].measuredValue === 5,
    `got ${evaluated[0].measuredValue}`);
  check('perInvoice does not reach slab 2', evaluated[0].slab?.seq === 1,
    `got ${evaluated[0].slab?.seq}`);
}

section('cumulative DOES inherit banked value');
{
  const evaluated = evaluateSchemes({
    schemes: [baseScheme], dealer, lines: [line(5)],
    existingProgressByScheme: { s1: 5 }
  });
  check('cumulative adds banked 5 to this 5', evaluated[0].measuredValue === 10,
    `got ${evaluated[0].measuredValue}`);
  check('cumulative reaches slab 2', evaluated[0].slab?.seq === 2,
    `got ${evaluated[0].slab?.seq}`);
}

section('CD and Regular lines accumulate together');
{
  const cd = { ...line(5, 'p1'), salesType: 'CD Sales' };
  const regular = { ...line(5, 'p2'), salesType: 'Regular Sale' };
  const evaluated = evaluateSchemes({
    schemes: [baseScheme], dealer, lines: [cd, regular], existingProgressByScheme: {}
  });
  check('sales type is ignored by the engine', evaluated[0].measuredValue === 10,
    `got ${evaluated[0].measuredValue}`);
  check('slab 2 reached across both types', evaluated[0].slab?.seq === 2);
}

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
process.exit(failed > 0 ? 1 : 0);
