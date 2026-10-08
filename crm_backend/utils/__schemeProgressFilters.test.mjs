/**
 * Tests for the Progress tab's filters in `getSchemeProgress`.
 *
 * This is the "who achieved this offer?" screen, so the filter→query mapping is
 * the whole feature. Exercised with a stub connection that CAPTURES the query
 * instead of hitting MongoDB, so every branch is checkable.
 *
 * Regression origin: the route/region dropdowns were populated from
 * `SchemeApplication.distinct('routeName')` — bare NAMES — and passed straight to
 * `Dealer.find({ routeId: <name> })`. `routeId` is an ObjectId, so choosing a
 * route threw a CastError and the filter never worked. They are now ids.
 *
 * Run: node utils/__schemeProgressFilters.test.mjs
 */
import assert from 'node:assert';

import { getSchemeProgress, getSchemeFilterOptions } from '../controllers/schemeController.js';

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
// Stub: captures every query passed to SchemeProgress, returns no rows.
// ---------------------------------------------------------------------------
const chainable = (rows) => {
  const node = {
    select: () => node,
    populate: () => node,
    sort: () => node,
    skip: () => node,
    limit: () => node,
    lean: async () => rows
  };
  return node;
};

const makeHarness = ({ dealerIds = [], routes = [], regions = [], schemes = [] } = {}) => {
  const captured = { find: [], count: [] };
  let json = null;

  const conn = {
    models: {
      SchemeProgress: {
        find: (q) => { captured.find.push(q); return chainable([]); },
        countDocuments: async (q) => { captured.count.push(q); return 0; }
      },
      Dealer: { find: () => chainable(dealerIds) },
      Route: { find: () => chainable(routes) },
      Region: { find: () => chainable(regions) },
      Scheme: { find: () => chainable(schemes) },
      // getModels() builds every model eagerly, so all of them must be present
      // or it falls through to dbConnection.model(). These two are not touched by
      // the code under test.
      SchemeApplication: {},
      Product: {},
      CreditNote: {},
      DealerLedger: {}
    },
    model: () => { throw new Error('stub must not create a model'); }
  };

  const req = { query: {}, dbConnection: conn };
  const res = {
    json: (payload) => { json = payload; },
    status: () => res
  };

  return {
    run: async (query) => { req.query = query; json = null; await getSchemeProgress(req, res); return json; },
    runOptions: async () => { json = null; await getSchemeFilterOptions(req, res); return json; },
    captured
  };
};

const THE_ID = '6a1f2b3c4d5e6f7a8b9c0d1e';
const ROUTE_ID = '6a1f2b3c4d5e6f7a8b9c0d2f';
const REGION_ID = '6a1f2b3c4d5e6f7a8b9c0d30';

// ===========================================================================
section('no filters -> a plain query');
// ===========================================================================
{
  const h = makeHarness();
  const out = await h.run({});
  eq('the find query is empty', h.captured.find[0], {});
  check('it responds successfully', out.success);
  check('it reports a summary', out.summary);
  eq('summary is all zeros', out.summary, { total: 0, achieved: 0, owing: 0, inProgress: 0 });
}

// ===========================================================================
section('achieved=true -> "who achieved this offer"');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ achieved: 'true' });
  eq('filters on a live achievement',
    h.captured.find[0].achievements, { $elemMatch: { revocationPending: { $ne: true } } });
  check('the summary counts achieved rows',
    h.captured.count.some((q) => q.achievements?.$elemMatch?.revocationPending));
}

// ===========================================================================
section('achieved=false -> "not achieved yet" (the exact complement)');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ achieved: 'false' });
  eq('filters on the ABSENCE of a live achievement',
    h.captured.find[0].achievements, { $not: { $elemMatch: { revocationPending: { $ne: true } } } });
}

// ===========================================================================
section('hasPending=true -> "owing a reward"');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ hasPending: 'true' });
  eq('needs a live, unredeemed, manual achievement',
    h.captured.find[0].achievements,
    { $elemMatch: { revocationPending: { $ne: true }, autoApplied: false, redeemed: { $ne: true } } });
}

// ===========================================================================
section('rewardType filter');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ rewardType: 'freeItem' });
  eq('filters on the achievement reward type',
    h.captured.find[0].achievements,
    { $elemMatch: { revocationPending: { $ne: true }, rewardType: 'freeItem' } });
}

// ===========================================================================
section('scheme / dealer / dates');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ scheme: THE_ID, dealer: THE_ID, from: '2026-10-01', to: '2026-11-07' });
  const q = h.captured.find[0];
  eq('scheme is an id match', String(q.scheme), THE_ID);
  eq('dealer is an id match', String(q.dealer), THE_ID);
  eq('from bounds the window start', q.windowFrom.$gte.toISOString(), new Date('2026-10-01').toISOString());
  eq('to bounds the window end', q.windowTo.$lte.toISOString(), new Date('2026-11-07').toISOString());
}

// ===========================================================================
section('route / region are ObjectIds, not names (the original bug)');
// ===========================================================================
{
  const h = makeHarness({ dealerIds: [{ _id: 'd1' }, { _id: 'd2' }] });
  await h.run({ route: ROUTE_ID });
  const q = h.captured.find[0];
  const dealerCond = q.dealer || q.$and?.find((c) => c.dealer)?.dealer;
  check('there is a dealer condition', Boolean(dealerCond));
  eq('the dealer set is an $in of ids', dealerCond.$in.map(String), ['d1', 'd2']);
  check('the query does NOT contain a bare route name', !JSON.stringify(q).includes('Mysore'));
}

// ===========================================================================
section('search is server-side (so it filters all pages, not just page 1)');
// ===========================================================================
{
  const h = makeHarness();
  await h.run({ search: 'Ravi' });
  const q = h.captured.find[0];
  const or = q.$or || q.$and?.find((c) => c.$or)?.$or;
  check('search becomes an $or', Array.isArray(or));
  eq('it covers the scheme and the denormalised dealer fields', or.length, 4);
  check('schemeCode is a RegExp', or[0].schemeCode instanceof RegExp);
  eq('...and case-insensitive', or[0].schemeCode.flags, 'i');
  check('dealerName is a RegExp', or[2].dealerName instanceof RegExp);
  eq('...and case-insensitive', or[2].dealerName.flags, 'i');
}

// ===========================================================================
section('a regex-special search must not throw or inject');
// ===========================================================================
{
  const h = makeHarness();
  const out = await h.run({ search: '(' });
  check('a "(" in the search box does not blow up', out && out.success);
  const q = h.captured.find[0];
  const or = q.$or || q.$and?.find((c) => c.$or)?.$or;
  eq('it is escaped', or[0].schemeCode.source, '\\(');

  const h2 = makeHarness();
  await h2.run({ schemeCode: '.*' });
  eq('schemeCode is escaped too', h2.captured.find[0].schemeCode.$regex, '\\.\\*');
  check('...and still case-insensitive', h2.captured.find[0].schemeCode.$options === 'i');
}

// ===========================================================================
section('search + route combine with $and (not overwrite each other)');
// ===========================================================================
{
  const h = makeHarness({ dealerIds: [{ _id: 'd1' }] });
  await h.run({ search: 'Ravi', route: ROUTE_ID });
  const q = h.captured.find[0];
  check('there is an $and', Array.isArray(q.$and));
  eq('it holds both conditions', q.$and.length, 2);
  check('the route condition is present', Boolean(q.$and[0].dealer?.$in));
  check('the search condition is present', Array.isArray(q.$and[1].$or));
}

// ===========================================================================
section('getSchemeFilterOptions returns ids from the MASTERS');
// ===========================================================================
{
  const h = makeHarness({
    routes: [{ _id: ROUTE_ID, name: 'Mysore Route', code: 'MY' }],
    regions: [{ _id: REGION_ID, name: 'South' }],
    schemes: [{ _id: THE_ID, schemeCode: 'OCT-01', schemeName: 'Buy 5 get 50', status: 'Active' }]
  });
  const out = await h.runOptions();
  eq('a route carries its id', out.data.routes[0]._id, ROUTE_ID);
  eq('...and its name', out.data.routes[0].name, 'Mysore Route');
  eq('a region carries its id', out.data.regions[0]._id, REGION_ID);
  eq('the scheme option shape is unchanged', out.data.schemes[0].schemeCode, 'OCT-01');
  check('reward types are offered', Array.isArray(out.data.rewardTypes) && out.data.rewardTypes.includes('points'));
}

// ===========================================================================
section('paging');
// ===========================================================================
{
  const h = makeHarness();
  const out = await h.run({ page: '3', limit: '25' });
  eq('page size is echoed', out.pagination.currentPage, 3);
  check('totalPages is present', out.pagination.totalPages >= 1);
}

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
