/**
 * Sales Order derived-field tests.
 *
 * The controller's edit path uses `findOneAndUpdate`, which BYPASSES the model's
 * `pre('save')` hook. That hook (models/SalesOrder.js) computes `totalPrice`,
 * `gstAmount`, `dueDate` and the order-level totals. So anything the hook derives
 * must be recomputed explicitly on the edit path or it silently goes stale — the
 * controller does that for the money fields, and this file guards the due date.
 *
 * These tests drive the controller's own helper via a tiny extraction harness so
 * they assert the REAL rule, not a re-implementation of it.
 *
 * Run: node utils/__salesOrderDerived.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCreditDays } from './creditTerms.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const CONTROLLER = path.join(BACKEND, 'controllers', 'salesOrderController.js');
const MODEL = path.join(BACKEND, 'models', 'SalesOrder.js');
const src = fs.readFileSync(CONTROLLER, 'utf8');

const tests = [];
const test = (label, fn) => {
  tests.push({ label, fn });
};
/** Register a section header so output stays ordered as tests actually run. */
const section = (title) => {
  tests.push({ header: title });
};

/**
 * Extract a top-level `const NAME = async (…) => { … }` or
 * `const NAME = async function (…) { … }` declaration's source text.
 */
const extractAsyncFunction = (source, name) => {
  const start = source.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`function ${name} not found`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not find the end of ${name}`);
};

// ---------------------------------------------------------------------------
// Extract the real `computeDueDate` from the controller and evaluate it, so a
// change to the rule shows up here instead of drifting from a copy.
// ---------------------------------------------------------------------------
/**
 * Extract a top-level `const NAME = (…) => { … }` declaration and evaluate it.
 *
 * Also handles the one-line delegate form
 * (`const NAME = (a, b) => addCreditDays(a, b);`) that `computeDueDate` now
 * uses after the due-date rule moved to `utils/creditTerms.js`. In that case
 * the delegate is evaluated against the real imported helpers, so the tests
 * below still exercise the ACTUAL rule rather than a copy of it.
 */
const extractArrowFunction = (source, name) => {
  const start = source.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`helper ${name} not found in the controller`);
  const arrowAt = source.indexOf('=>', start);
  if (arrowAt === -1) throw new Error(`could not find the arrow of ${name}`);
  const after = source.slice(arrowAt + 2).trimStart();

  // One-line delegate: no brace immediately after `=>`.
  if (!after.startsWith('{')) {
    const end = source.indexOf(';', arrowAt);
    if (end === -1) throw new Error(`could not find the end of ${name}`);
    const decl = source.slice(start, end + 1);
    // eslint-disable-next-line no-new-func
    return new Function('addCreditDays', `${decl}; return ${name};`)(addCreditDays);
  }

  const bodyStart = after.startsWith('{') ? source.indexOf('{', arrowAt) : -1;
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        const decl = source.slice(start, i + 1);
        // eslint-disable-next-line no-new-func
        return new Function('addCreditDays', `${decl}; return ${name};`)(addCreditDays);
      }
    }
  }
  throw new Error(`could not find the end of ${name}`);
};

const computeDueDate = extractArrowFunction(src, 'computeDueDate');

section('computeDueDate: the single due-date rule');

test('adds the credit days to the order date', () => {
  const due = computeDueDate('2026-10-01T00:00:00.000Z', 30);
  assert.ok(due instanceof Date);
  assert.equal(due.toISOString().slice(0, 10), '2026-10-31');
});

test('creditDays = 0 is honoured (pay on demand), not treated as unset', () => {
  // The bug this guards: a truthiness check (`if (creditDays)`) silently skips 0
  // and leaves dueDate null, so the order never appears in the overdue report.
  const due = computeDueDate('2026-10-01T00:00:00.000Z', 0);
  assert.ok(due instanceof Date, 'expected a date for creditDays = 0');
  assert.equal(due.toISOString().slice(0, 10), '2026-10-01');
});

test('returns null when the order date is missing', () => {
  assert.equal(computeDueDate(null, 30), null);
  assert.equal(computeDueDate(undefined, 30), null);
});

test('returns null when credit days are missing', () => {
  assert.equal(computeDueDate('2026-10-01T00:00:00.000Z', null), null);
  assert.equal(computeDueDate('2026-10-01T00:00:00.000Z', undefined), null);
});

test('returns null for an unparseable order date instead of an Invalid Date', () => {
  const due = computeDueDate('not-a-date', 30);
  assert.equal(due, null);
});

test('returns null for non-numeric credit days', () => {
  assert.equal(computeDueDate('2026-10-01T00:00:00.000Z', 'thirty'), null);
});

test('accepts numeric strings (form input arrives as a string)', () => {
  const due = computeDueDate('2026-10-01T00:00:00.000Z', '15');
  assert.equal(due.toISOString().slice(0, 10), '2026-10-16');
});

test('crosses a month boundary correctly', () => {
  const due = computeDueDate('2026-01-20T00:00:00.000Z', 15);
  assert.equal(due.toISOString().slice(0, 10), '2026-02-04');
});

// ---------------------------------------------------------------------------
// Source-level guards: the rule must actually be WIRED IN, not just defined.
// A correct helper that nothing calls is the failure mode that keeps recurring
// in this controller (see `isSchemeFreeItem`).
// ---------------------------------------------------------------------------

section('the due-date rule is wired into every path that needs it');

test('the create path recomputes the due date', () => {
  assert.ok(
    /const dueDate = computeDueDate\(orderDate, finalCreditDays\)/.test(src),
    'createSalesOrder no longer derives dueDate from the shared helper'
  );
});

test('the auto-split create path recomputes the due date', () => {
  assert.ok(
    /const dueDate = computeDueDate\(orderDate, creditDays\)/.test(src),
    'createSingleSalesOrder no longer derives dueDate from the shared helper'
  );
});

test('the EDIT path recomputes the due date (it uses findOneAndUpdate, which skips pre-save)', () => {
  // Locate updateSalesOrderUnlocked and confirm a computeDueDate call sits inside it.
  const updateStart = src.indexOf('const updateSalesOrderUnlocked = async (req, res)');
  assert.ok(updateStart > -1, 'updateSalesOrderUnlocked not found');
  const nextTopLevel = src.indexOf('\nexport const ', updateStart);
  const updateBody = src.slice(updateStart, nextTopLevel === -1 ? undefined : nextTopLevel);
  assert.ok(
    updateBody.includes('computeDueDate('),
    'updateSalesOrderUnlocked does not recompute dueDate — editing orderDate/creditDays '
    + 'leaves a stale due date'
  );
});

test('the edit path does not clobber an explicitly supplied due date', () => {
  const updateStart = src.indexOf('const updateSalesOrderUnlocked = async (req, res)');
  const updateBody = src.slice(updateStart, src.indexOf('\nexport const ', updateStart));
  assert.ok(
    /req\.body\.dueDate === undefined/.test(updateBody),
    'the edit path must only fill dueDate when the caller did not send one'
  );
});

test('the model pre-save hook still computes dueDate for the non-update paths', () => {
  const model = fs.readFileSync(MODEL, 'utf8');
  assert.ok(
    /this\.dueDate = dueDate/.test(model),
    'SalesOrder pre("save") no longer computes dueDate'
  );
});

// ---------------------------------------------------------------------------
// generateOrderNumber: INVARIANT — never return a number that already exists.
//
// `orderNumber` is `unique: true`, so a collision fails the entire order
// creation and surfaces to the user as a confusing 400, "Order number already
// exists" — for what is really just a retry.
//
// Honest scope: the PREVIOUS implementation (take max+1, check it once) is not
// known to have produced a collision — max+1 cannot already be taken when the
// list is sorted by the numeric max. The probe loop is defensive hardening, so
// this is NOT a regression test for an observed bug. Treat a failure here as
// "the numbering contract changed", and keep the invariant intact.
//
// These tests drive the real function with a stub SalesOrder model.
// ---------------------------------------------------------------------------

section('generateOrderNumber: never returns a taken number');

/** Build a fake getModels/SalesOrder pair for a given set of taken numbers. */
const runGenerateOrderNumber = async (takenNumbers, { year } = {}) => {
  const currentYear = year ?? new Date().getFullYear();
  const prefix = `SO-${currentYear}-`;

  // Minimal mongoose-like chainable: .sort() returns itself, and the object is
  // awaitable so `await query` yields the resolved value.
  const makeQuery = (value) => {
    const q = {
      sort: () => q,
      session: () => q,
      then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return q;
  };

  const SalesOrder = {
    findOne: (filter) => {
      // The "highest number so far" lookup uses { orderNumber: { $regex: ... } }.
      if (filter.orderNumber && typeof filter.orderNumber === 'object'
          && filter.orderNumber.$regex) {
        const matching = takenNumbers
          .filter((n) => n.startsWith(prefix))
          .sort();
        const last = matching[matching.length - 1];
        return makeQuery(last ? { orderNumber: last } : null);
      }
      // An exact-candidate existence probe.
      return makeQuery(takenNumbers.includes(filter.orderNumber)
        ? { orderNumber: filter.orderNumber }
        : null);
    }
  };

  const dbConnection = {
    models: { SalesOrder },
    model: (name) => {
      if (name === 'SalesOrder') return SalesOrder;
      throw new Error(`unexpected model request: ${name}`);
    }
  };

  // Evaluate the real function body from the controller source.
  const decl = extractAsyncFunction(src, 'generateOrderNumber');
  const getModelsStub = () => ({ SalesOrder });
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'getModels',
    `${decl}; return generateOrderNumber;`
  )(getModelsStub);
  return fn(dbConnection, null);
};

test('returns the numeric successor of the highest existing number', async () => {
  const year = 2026;
  const taken = ['SO-2026-0001', 'SO-2026-0002', 'SO-2026-0003'];
  const result = await runGenerateOrderNumber(taken, { year });
  assert.equal(result, 'SO-2026-0004');
});

// The INVARIANT, checked across a spread of taken-number shapes. A failure here
// means the numbering contract changed, not that a known bug regressed.
const TAKEN_CASES = [
  [],
  ['SO-2026-0001'],
  ['SO-2026-0001', 'SO-2026-0002'],
  ['SO-2026-0001', 'SO-2026-0003'],
  ['SO-2026-0002', 'SO-2026-0003', 'SO-2026-0004'],
  ['SO-2026-0001', 'SO-2026-0002', 'SO-2026-0005'],
  ['SO-2026-0001', 'SO-2026-9999']
];
for (const taken of TAKEN_CASES) {
  test(`never returns a taken number (taken: ${taken.length ? taken.join(', ') : 'none'})`, async () => {
    const result = await runGenerateOrderNumber(taken, { year: 2026 });
    assert.ok(!taken.includes(result), `returned a taken number: ${result}`);
  });
}

test('falls back to a unique number instead of looping forever when the probe window is full', async () => {
  const year = 2026;
  // Fill the entire 50-candidate probe window.
  const taken = Array.from({ length: 60 }, (_, i) =>
    `SO-2026-${String(i + 1).padStart(4, '0')}`);
  const result = await runGenerateOrderNumber(taken, { year });
  assert.ok(result.startsWith('SO-2026-'), `unexpected format: ${result}`);
  assert.ok(!taken.includes(result), `returned a taken number: ${result}`);
});

test('uses the 4-digit padded form for normal numbers', async () => {
  const year = 2026;
  const result = await runGenerateOrderNumber([], { year });
  assert.equal(result, 'SO-2026-0001');
});

// Run every registered test sequentially, then print the summary.
let passed = 0;
let failed = 0;
for (const entry of tests) {
  if (entry.header) {
    console.log(`\n--- ${entry.header} ---`);
    continue;
  }
  try {
    // eslint-disable-next-line no-await-in-loop
    await entry.fn();
    passed += 1;
    console.log(`  ok  ${entry.label}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${entry.label}`);
    console.error(`       ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`\n================ ${passed} passed, ${failed} failed ================`);
