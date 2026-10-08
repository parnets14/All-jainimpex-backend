/**
 * Focused harness for the scheme opt-in GATE.
 *
 * The gate is the salesman's choice, taken on the Sales Order eligibility
 * panel, about which schemes to actually give. Its entire correctness rests on
 * one distinction, so that is what this suite pins down:
 *
 *   field ABSENT          -> no gate; the engine counts every matching scheme
 *                            (the behaviour before this feature existed)
 *   field is an ARRAY     -> gate ON; only the listed schemes count
 *   field is an EMPTY array -> gate ON with nothing allowed
 *
 * Getting this wrong is not cosmetic: `default: []` instead of
 * `default: undefined` would silently switch the gate on for every existing
 * document and stop all schemes from paying out.
 *
 * Run: node services/__schemeGate.test.mjs
 */

import mongoose from 'mongoose';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import {
  normalizeAppliedSchemes,
  appliedSchemeIdList
} from '../models/appliedScheme.js';

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

const oid = () => new mongoose.Types.ObjectId();

// ---------------------------------------------------------------------------
section('normalizeAppliedSchemes — absent stays absent');
// ---------------------------------------------------------------------------
// This is the load-bearing case: anything that is not an array must yield
// `undefined` so the caller leaves the field off the document entirely.
eq('undefined stays undefined', normalizeAppliedSchemes(undefined), undefined);
eq('null stays undefined', normalizeAppliedSchemes(null), undefined);
eq('a bare string is not a selection', normalizeAppliedSchemes('scheme-1'), undefined);
eq('a number is not a selection', normalizeAppliedSchemes(42), undefined);
eq('a plain object is not a selection', normalizeAppliedSchemes({ schemeId: 'x' }), undefined);

// ---------------------------------------------------------------------------
section('normalizeAppliedSchemes — an array always means "gate on"');
// ---------------------------------------------------------------------------
const empty = normalizeAppliedSchemes([]);
check('empty array survives as an array', Array.isArray(empty));
eq('empty array has no rows', empty.length, 0);

const fromIds = normalizeAppliedSchemes(['a', 'b']);
eq('id list becomes rows', fromIds.length, 2);
eq('id is carried', fromIds[0].schemeId, 'a');
eq('code defaults to empty', fromIds[0].schemeCode, '');
eq('name defaults to empty', fromIds[0].schemeName, '');
eq('eligibleAtOrder defaults to false', fromIds[0].eligibleAtOrder, false);

const fromRows = normalizeAppliedSchemes([
  { schemeId: 's1', schemeCode: 'OCT-1', schemeName: 'Buy 10 Get 1', eligibleAtOrder: true }
]);
eq('rich row keeps its code', fromRows[0].schemeCode, 'OCT-1');
eq('rich row keeps its name', fromRows[0].schemeName, 'Buy 10 Get 1');
eq('rich row keeps its flag', fromRows[0].eligibleAtOrder, true);

const messy = normalizeAppliedSchemes(['a', null, { noSchemeId: true }, 7, { schemeId: 'b' }]);
eq('junk rows are dropped, real ones kept', messy.length, 2);
eq('the surviving first row is the id form', messy[0].schemeId, 'a');
eq('the surviving second row is the object form', messy[1].schemeId, 'b');

// ---------------------------------------------------------------------------
section('SAFETY: malformed input must fail OPEN, not closed');
// ---------------------------------------------------------------------------
// A non-empty payload whose every entry is junk must NOT collapse to an empty
// array — that would switch the gate on with nothing allowed and silently strip
// every scheme from the order. It is treated as "nothing was sent" instead.
// NOTE: a bare string IS a valid id form, so junk here must be non-string.
eq('all-junk array -> undefined (no gate)', normalizeAppliedSchemes([null, 7, {}, { notAScheme: 1 }]), undefined);
eq('a single junk object -> undefined', normalizeAppliedSchemes([{ notAScheme: 1 }]), undefined);
// A bare string id is legitimate, so an all-string array must still gate.
eq('a bare id string is accepted', normalizeAppliedSchemes(['abc'])[0].schemeId, 'abc');

// A genuinely empty array is a real choice and must still gate.
const deliberateEmpty = normalizeAppliedSchemes([]);
check('a truly empty array still gates', Array.isArray(deliberateEmpty) && deliberateEmpty.length === 0);

// And a partly-valid array keeps the valid rows (gate stays on, narrowed).
const partly = normalizeAppliedSchemes([null, { schemeId: 'keep-me' }]);
eq('a partly-valid array keeps the valid rows', partly.length, 1);
eq('and the valid id survives', partly[0].schemeId, 'keep-me');

// ---------------------------------------------------------------------------
section('appliedSchemeIdList — null means "no gate", [] means "nothing allowed"');
// ---------------------------------------------------------------------------
eq('undefined -> null (no gate)', appliedSchemeIdList(undefined), null);
eq('null -> null (no gate)', appliedSchemeIdList(null), null);
eq('a non-array -> null (no gate)', appliedSchemeIdList('nope'), null);

const noneAllowed = appliedSchemeIdList([]);
check('empty selection -> empty array, NOT null', Array.isArray(noneAllowed) && noneAllowed.length === 0);

const someAllowed = appliedSchemeIdList([{ schemeId: 's1' }, { schemeId: 's2' }]);
eq('rows become plain id strings', someAllowed.length, 2);
eq('ids are stringified', someAllowed[0], 's1');

// ---------------------------------------------------------------------------
section('model wiring — the field must stay absent, not become []');
// ---------------------------------------------------------------------------
const SalesOrder = mongoose.model('SalesOrderGateCheck', salesOrderSchema);
const DealerInvoice = mongoose.model('DealerInvoiceGateCheck', dealerInvoiceSchema);

const legacyOrder = new SalesOrder({ orderNumber: 'SO-LEGACY', dealer: oid() });
eq('legacy order: value is undefined', legacyOrder.appliedSchemes, undefined);
check('legacy order: key absent from toObject()', !('appliedSchemes' in legacyOrder.toObject()));

const legacyInvoice = new DealerInvoice({ invoiceNumber: 'INV-LEGACY', dealer: oid() });
eq('legacy invoice: value is undefined', legacyInvoice.appliedSchemes, undefined);
check('legacy invoice: key absent from toObject()', !('appliedSchemes' in legacyInvoice.toObject()));

// Explicitly passing the normaliser's output must behave identically.
const absentOrder = new SalesOrder({
  orderNumber: 'SO-ABSENT', dealer: oid(),
  appliedSchemes: normalizeAppliedSchemes(undefined)
});
eq('explicit undefined stays undefined', absentOrder.appliedSchemes, undefined);
check('explicit undefined keeps the key absent', !('appliedSchemes' in absentOrder.toObject()));

const gatedOrder = new SalesOrder({
  orderNumber: 'SO-GATED', dealer: oid(),
  appliedSchemes: normalizeAppliedSchemes([{ schemeId: oid(), schemeCode: 'P1', schemeName: 'Offer' }])
});
eq('gated order stores one row', gatedOrder.appliedSchemes.length, 1);
eq('gated order keeps the code', gatedOrder.appliedSchemes[0].schemeCode, 'P1');

const blockedOrder = new SalesOrder({
  orderNumber: 'SO-BLOCKED', dealer: oid(),
  appliedSchemes: normalizeAppliedSchemes([])
});
check('empty gate stays an array on the document', Array.isArray(blockedOrder.appliedSchemes));
eq('empty gate stores nothing', blockedOrder.appliedSchemes.length, 0);
check('empty gate IS present (gate on)', 'appliedSchemes' in blockedOrder.toObject());

// ---------------------------------------------------------------------------
section('round-trip: what the panel posts is what the engine reads');
// ---------------------------------------------------------------------------
const posted = [
  { schemeId: 'id-1', schemeCode: 'OCT-001', schemeName: 'Buy 10 Get 1', eligibleAtOrder: false },
  { schemeId: 'id-2', schemeCode: 'OCT-002', schemeName: 'Diwali Points', eligibleAtOrder: true }
];
const stored = normalizeAppliedSchemes(posted);
const idsForEngine = appliedSchemeIdList(stored);
eq('both ticked schemes reach the engine', idsForEngine.length, 2);
eq('first id survives', idsForEngine[0], 'id-1');
eq('second id survives', idsForEngine[1], 'id-2');

// A single tick, and the in-progress case the business described: the order
// only has 4 of the 10 needed, so the scheme is not yet eligible but the
// salesman still opts in.
const inProgress = normalizeAppliedSchemes([
  { schemeId: 'id-1', schemeCode: 'OCT-001', schemeName: 'Buy 10 Get 1', eligibleAtOrder: false }
]);
eq('in-progress scheme is still storable', inProgress.length, 1);
eq('and still reaches the engine', appliedSchemeIdList(inProgress)[0], 'id-1');

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================\n`);
process.exit(failed === 0 ? 0 : 1);
