/**
 * Dealer-extra discount must not stack on a product covered by an applied scheme.
 *
 * WHY THIS EXISTS
 * Dealer extra discount (Dealer Master) is a standing term. When a scheme is
 * applied, the scheme is already the concession on the products it covers, so
 * giving both hands the dealer two benefits on the same units. The rule is:
 *
 *   a product inside an APPLIED scheme's scope gets no dealer-extra discount.
 *
 * Direct and level-based discounts are untouched — only dealer-extra is
 * suppressed. This file pins that boundary, because "suppressed too much" and
 * "suppressed too little" are both silent money leaks.
 *
 * Run: node utils/__schemeCoverage.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isProductCoveredBySchemes,
  effectiveDealerExtraDiscount,
  loadAppliedSchemeScopes,
  schemeScopeLine
} from './schemeCoverage.js';

let passed = 0;
let failed = 0;
const test = async (label, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
};

const ID = (n) => `507f1f77bcf86cd7994390${String(n).padStart(2, '0')}`;

const PRODUCT = {
  _id: ID(1),
  brand: ID(11),
  category: ID(21),
  subcategory: ID(31)
};
const OTHER_PRODUCT = {
  _id: ID(2),
  brand: ID(12),
  category: ID(22),
  subcategory: ID(32)
};

const brandScheme = { schemeId: ID(90), scope: { level: 'brand', brand: ID(11) } };
const allScheme = { schemeId: ID(91), scope: { level: 'all' } };
const productScheme = { schemeId: ID(92), scope: { level: 'product', products: [ID(1)] } };

console.log('\n--- the gate: no applied schemes means no suppression ---');

await test('no applied schemes -> nothing is covered', () => {
  assert.equal(isProductCoveredBySchemes(PRODUCT, []), false);
  assert.equal(isProductCoveredBySchemes(PRODUCT, undefined), false);
});

await test('dealer extra is preserved when nothing is covered', () => {
  assert.equal(effectiveDealerExtraDiscount({
    configuredRate: 5, productOrLine: PRODUCT, schemeScopes: []
  }), 5);
});

await test('dealer extra is preserved when the scheme does not cover this product', () => {
  assert.equal(effectiveDealerExtraDiscount({
    configuredRate: 5, productOrLine: OTHER_PRODUCT, schemeScopes: [brandScheme]
  }), 5);
});

console.log('\n--- coverage by scope level ---');

await test('brand-scoped scheme covers only that brand', () => {
  assert.equal(isProductCoveredBySchemes(PRODUCT, [brandScheme]), true);
  assert.equal(isProductCoveredBySchemes(OTHER_PRODUCT, [brandScheme]), false);
});

await test('product-scoped scheme covers only that product', () => {
  assert.equal(isProductCoveredBySchemes(PRODUCT, [productScheme]), true);
  assert.equal(isProductCoveredBySchemes(OTHER_PRODUCT, [productScheme]), false);
});

await test('an "all" scheme covers every product', () => {
  assert.equal(isProductCoveredBySchemes(PRODUCT, [allScheme]), true);
  assert.equal(isProductCoveredBySchemes(OTHER_PRODUCT, [allScheme]), true);
});

await test('a mix scheme covers a product that sits in one of its groups', () => {
  const mix = {
    schemeId: ID(93),
    scope: {
      level: 'mix',
      mixGroups: [
        { products: [ID(1)], minQuantity: 5 },
        { brand: ID(99), minQuantity: 5 }
      ]
    }
  };
  assert.equal(isProductCoveredBySchemes(PRODUCT, [mix]), true);
  assert.equal(isProductCoveredBySchemes(OTHER_PRODUCT, [mix]), false);
});

console.log('\n--- the suppression itself ---');

await test('a covered product gets exactly 0, never the configured rate', () => {
  assert.equal(effectiveDealerExtraDiscount({
    configuredRate: 7.5, productOrLine: PRODUCT, schemeScopes: [brandScheme]
  }), 0);
});

await test('several schemes: covered by ANY one is enough', () => {
  assert.equal(isProductCoveredBySchemes(PRODUCT, [
    { scope: { level: 'brand', brand: ID(12) } },
    productScheme
  ]), true);
});

await test('a line shape (product id under `product`) is understood too', () => {
  const line = { product: ID(1), brand: ID(11), category: ID(21), subcategory: ID(31) };
  assert.equal(isProductCoveredBySchemes(line, [brandScheme]), true);
});

await test('populated refs ({_id}) are understood', () => {
  const line = {
    product: { _id: ID(1) },
    brand: { _id: ID(11) },
    category: { _id: ID(21) },
    subcategory: { _id: ID(31) }
  };
  assert.equal(isProductCoveredBySchemes(line, [brandScheme]), true);
});

await test('schemeScopeLine normalises ids to strings', () => {
  const scopeLine = schemeScopeLine(PRODUCT);
  assert.equal(scopeLine.productId, ID(1));
  assert.equal(scopeLine.brandId, ID(11));
});

console.log('\n--- loading the gate ---');

const fakeSchemeModel = (docs, onQuery) => ({
  find: (query) => {
    if (onQuery) onQuery(query);
    const ids = (query?._id?.$in || []).map(String);
    const rows = docs.filter((d) => ids.includes(String(d._id)));
    const chain = { select: () => chain, lean: () => Promise.resolve(rows) };
    return chain;
  }
});

const SCHEME_DOCS = [
  { _id: ID(90), code: 'SCH-1', name: 'Brand offer', scope: { level: 'brand', brand: ID(11) } }
];

await test('no gate at all returns no scopes and does not query', async () => {
  let queried = false;
  const result = await loadAppliedSchemeScopes(
    fakeSchemeModel(SCHEME_DOCS, () => { queried = true; }),
    undefined
  );
  assert.deepEqual(result, []);
  assert.equal(queried, false);
});

await test('an empty gate returns no scopes (nothing is given)', async () => {
  const result = await loadAppliedSchemeScopes(fakeSchemeModel(SCHEME_DOCS), []);
  assert.deepEqual(result, []);
});

await test('a ticked scheme resolves to its scope', async () => {
  const result = await loadAppliedSchemeScopes(fakeSchemeModel(SCHEME_DOCS), [
    { schemeId: ID(90) }
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].scope.level, 'brand');
  assert.equal(result[0].code, 'SCH-1');
});

await test('many rows on the same scheme use one query', async () => {
  let calls = 0;
  await loadAppliedSchemeScopes(fakeSchemeModel(SCHEME_DOCS, () => { calls += 1; }), [
    { schemeId: ID(90) },
    { schemeId: ID(90) }
  ]);
  assert.equal(calls, 1);
});

console.log('\n--- the controllers actually pass the gate ---');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = fs.readFileSync(path.join(ROOT, 'controllers', 'salesOrderController.js'), 'utf8');
const INVOICE = fs.readFileSync(path.join(ROOT, 'controllers', 'dealerInvoiceController.js'), 'utf8');

await test('sales order canonicaliser accepts schemeScopes', () => {
  assert.ok(/canonicalizeSalesOrderProducts = async \(\{[\s\S]{0,200}schemeScopes/.test(ORDER));
  assert.ok(/schemeCovered = isProductCoveredBySchemes\(product, schemeScopes\)/.test(ORDER));
});

await test('every sales-order create/preview path supplies scopes', () => {
  const supplied = (ORDER.match(/loadAppliedSchemeScopes\(/g) || []).length;
  assert.ok(supplied >= 4, `expected scopes on preview, create, reprice and split paths; found ${supplied}`);
});

await test('invoice canonicaliser derives scopes from the linked order', () => {
  assert.ok(/effectiveSchemeScopes[\s\S]{0,200}loadAppliedSchemeScopes/.test(INVOICE));
});

await test('invoice dealer-extra resolver honours schemeCovered', () => {
  assert.ok(/if \(schemeCovered\) return 0;/.test(INVOICE));
  // The invoice canonicaliser must compute coverage and pass it to the resolver.
  assert.ok(
    /const schemeCovered = isProductCoveredBySchemes\(product, effectiveSchemeScopes\);/.test(INVOICE),
    'invoice does not compute schemeCovered from the effective scopes'
  );
  assert.ok(
    /resolveAndValidateDealerExtraDiscount\(\{[\s\S]{0,200}schemeCovered\b/.test(INVOICE),
    'invoice resolver is not given the coverage flag'
  );
});

await test('the invoice preview path also suppresses on coverage', () => {
  assert.ok(/!isProductCoveredBySchemes\(product, schemeScopes\)/.test(INVOICE));
});

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
