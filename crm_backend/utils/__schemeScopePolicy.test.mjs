/**
 * Tests for utils/schemeScopePolicy.js — the blank-selector fix.
 *
 * Regression origin: creating a Brand-scoped scheme failed with
 *   Cast to ObjectId failed for value "" at path "category" because of "BSONError"
 * because the builder posted `category: ""` / `subcategory: ""` for selectors the
 * chosen level does not use.
 *
 * Pure, no DB.
 */
import assert from 'node:assert';

let passed = 0;
let failed = 0;

const section = (name) => console.log(`\n--- ${name} ---`);
const eq = (label, actual, expected) => {
  try {
    assert.deepStrictEqual(actual, expected);
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch {
    failed += 1;
    console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
  }
};
const check = (label, actual) => eq(label, Boolean(actual), true);

const {
  isBlankId,
  cleanId,
  cleanIdList,
  sanitizeScope,
  sanitizeSlabs,
  sanitizeProductSlabs,
  sanitizeSchemePayload
} = await import('./schemeScopePolicy.js');

// ---------------------------------------------------------------------------
section('isBlankId');
// ---------------------------------------------------------------------------
check('"" is blank', isBlankId(''));
check('"   " is blank', isBlankId('   '));
check('null is blank', isBlankId(null));
check('undefined is blank', isBlankId(undefined));
check('a real id is not blank', !isBlankId('507f1f77bcf86cd799439011'));
check('0 is not blank (only strings are trimmed)', !isBlankId(0));
check('[] is not blank', !isBlankId([]));

// ---------------------------------------------------------------------------
section('cleanId');
// ---------------------------------------------------------------------------
eq('"" -> undefined', cleanId(''), undefined);
eq('"  " -> undefined', cleanId('  '), undefined);
eq('null -> undefined', cleanId(null), undefined);
eq('a real id passes through', cleanId('abc123'), 'abc123');
eq('a malformed id is NOT discarded', cleanId('not-an-objectid'), 'not-an-objectid');

// ---------------------------------------------------------------------------
section('cleanIdList');
// ---------------------------------------------------------------------------
eq('blanks are removed', cleanIdList(['a', '', null, 'b', undefined]), ['a', 'b']);
eq('non-array -> []', cleanIdList(undefined), []);
eq('non-array -> [] (string)', cleanIdList('a'), []);

// ---------------------------------------------------------------------------
section('THE BUG — a brand-scoped scope no longer carries blank ObjectIds');
// ---------------------------------------------------------------------------
// Exactly what the form posted before the fix.
const brandScope = sanitizeScope({
  level: 'brand',
  brand: '507f1f77bcf86cd799439011',
  category: '',
  subcategory: '',
  products: [],
  mixGroups: []
});
eq('brand survives', brandScope.brand, '507f1f77bcf86cd799439011');
eq('category is omitted, not ""', brandScope.category, undefined);
eq('subcategory is omitted, not ""', brandScope.subcategory, undefined);
check('category key is absent from JSON', !('category' in JSON.parse(JSON.stringify(brandScope))));
eq('level is preserved', brandScope.level, 'brand');

// ---------------------------------------------------------------------------
section('the "all" level (default) sends no selectors at all');
// ---------------------------------------------------------------------------
const allScope = sanitizeScope({ level: 'all', brand: '', category: '', subcategory: '', products: [], mixGroups: [] });
eq('brand omitted', allScope.brand, undefined);
eq('category omitted', allScope.category, undefined);
eq('subcategory omitted', allScope.subcategory, undefined);
eq('serialises to just the level', JSON.parse(JSON.stringify(allScope)), { level: 'all', products: [], mixGroups: [] });

// ---------------------------------------------------------------------------
section('category / subcategory levels keep their own selector only');
// ---------------------------------------------------------------------------
const catScope = sanitizeScope({ level: 'category', brand: '', category: 'cat-1', subcategory: '' });
eq('category kept', catScope.category, 'cat-1');
eq('brand dropped', catScope.brand, undefined);
eq('subcategory dropped', catScope.subcategory, undefined);

const subScope = sanitizeScope({ level: 'subcategory', brand: '', category: '', subcategory: 'sub-1' });
eq('subcategory kept', subScope.subcategory, 'sub-1');

// ---------------------------------------------------------------------------
section('product level — blank entries in the products list are dropped');
// ---------------------------------------------------------------------------
const prodScope = sanitizeScope({ level: 'product', brand: '', category: '', subcategory: '', products: ['p1', '', null, 'p2'] });
eq('products cleaned', prodScope.products, ['p1', 'p2']);

// ---------------------------------------------------------------------------
section('mix groups — per-group selectors are cleaned too');
// ---------------------------------------------------------------------------
const mixScope = sanitizeScope({
  level: 'mix',
  mixGroups: [
    { groupName: 'Pipes', brand: 'b1', category: '', subcategory: '', products: [], minQuantity: 5, ratioPercentage: 50 },
    { groupName: 'Fittings', brand: '', category: 'c1', subcategory: '', products: ['p9', ''], minQuantity: 5, ratioPercentage: 50 }
  ]
});
eq('group 1 brand kept', mixScope.mixGroups[0].brand, 'b1');
eq('group 1 category omitted', mixScope.mixGroups[0].category, undefined);
eq('group 1 keeps its minimum', mixScope.mixGroups[0].minQuantity, 5);
eq('group 2 category kept', mixScope.mixGroups[1].category, 'c1');
eq('group 2 products cleaned', mixScope.mixGroups[1].products, ['p9']);
eq('group 2 ratio kept', mixScope.mixGroups[1].ratioPercentage, 50);
check('both groups survive', mixScope.mixGroups.length === 2);

// A group with nothing selected can never match (`mixGroupMatchesLine` ends with
// `Boolean(group.brand || group.category || group.subcategory)`), so it is dead
// weight and must not be stored.
const deadGroups = sanitizeScope({
  level: 'mix',
  mixGroups: [{ groupName: 'Empty', brand: '', category: '', subcategory: '', products: [] }]
});
eq('a selector-less, product-less group is dropped', deadGroups.mixGroups, []);

// ---------------------------------------------------------------------------
section('sanitizeScope leaves other dimensions and unknown keys alone');
// ---------------------------------------------------------------------------
const extra = sanitizeScope({ level: 'brand', brand: 'b1', someFutureKey: 'keep-me' });
eq('unknown key preserved', extra.someFutureKey, 'keep-me');

eq('a non-object scope is returned untouched', sanitizeScope('nope'), 'nope');
eq('undefined scope stays undefined', sanitizeScope(undefined), undefined);

// ---------------------------------------------------------------------------
section('sanitizeSlabs — freeItemProduct blank becomes null (the schema default)');
// ---------------------------------------------------------------------------
const slabs = sanitizeSlabs([
  { seq: 1, from: 0, to: 10, reward: { type: 'points', points: 5, freeItemProduct: '' } },
  { seq: 2, from: 10, to: null, reward: { type: 'freeItem', freeItemQuantity: 1, freeItemProduct: 'p1' } }
]);
eq('blank free product -> null', slabs[0].reward.freeItemProduct, null);
eq('a chosen free product is kept', slabs[1].reward.freeItemProduct, 'p1');
eq('points survive', slabs[0].reward.points, 5);
eq('a slab without a reward is untouched', sanitizeSlabs([{ seq: 1, from: 0 }])[0].from, 0);

// ---------------------------------------------------------------------------
section('sanitizeProductSlabs — product is required, so blank -> undefined');
// ---------------------------------------------------------------------------
const ps = sanitizeProductSlabs([
  { product: 'p1', label: 'A', slabs: [{ seq: 1, from: 0, to: null, reward: { type: 'points', freeItemProduct: '' } }] }
]);
eq('product kept', ps[0].product, 'p1');
eq('nested slab cleaned', ps[0].slabs[0].reward.freeItemProduct, null);

const psBlank = sanitizeProductSlabs([{ product: '', label: '', slabs: [] }]);
// Left as `undefined` so validateProductSlabs reports "select a product" rather
// than the ladder silently disappearing.
eq('blank product -> undefined (so validation can complain)', psBlank[0].product, undefined);

// ---------------------------------------------------------------------------
section('sanitizeSchemePayload — partial updates keep their absent-means-untouched meaning');
// ---------------------------------------------------------------------------
const partial = sanitizeSchemePayload({ schemeName: 'X' });
check('scope not invented', !('scope' in partial));
check('slabs not invented', !('slabs' in partial));
check('productSlabs not invented', !('productSlabs' in partial));
eq('other fields pass through', partial.schemeName, 'X');

const full = sanitizeSchemePayload({
  schemeName: 'Diwali',
  scope: { level: 'brand', brand: 'b1', category: '', subcategory: '' },
  slabs: [{ seq: 1, from: 0, to: null, reward: { type: 'points', points: 100, freeItemProduct: '' } }],
  productSlabs: [{ product: '', slabs: [] }]
});
eq('scope cleaned', full.scope.category, undefined);
eq('slabs cleaned', full.slabs[0].reward.freeItemProduct, null);
eq('productSlabs cleaned', full.productSlabs[0].product, undefined);

eq('a null body -> {}', sanitizeSchemePayload(null), {});
eq('a non-object body passes through', sanitizeSchemePayload('x'), 'x');

// ---------------------------------------------------------------------------
section('the whole payload survives a JSON round trip (what actually crosses the wire)');
// ---------------------------------------------------------------------------
const wire = JSON.parse(JSON.stringify(sanitizeSchemePayload({
  schemeCode: 'OCT-003',
  schemeName: 'Brand offer',
  scope: { level: 'brand', brand: 'b1', category: '', subcategory: '', products: [], mixGroups: [] },
  slabs: [{ seq: 1, from: 0, to: null, reward: { type: 'freeItem', freeItemQuantity: 1, freeItemRule: 'sameProduct', freeItemProduct: '' } }]
})));
eq('wire scope has no empty category', wire.scope.category, undefined);
check('wire scope has no category key', !('category' in wire.scope));
eq('wire free product is null', wire.slabs[0].reward.freeItemProduct, null);
eq('wire level intact', wire.scope.level, 'brand');

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
