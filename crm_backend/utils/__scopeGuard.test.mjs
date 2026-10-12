/**
 * Static scope guards for the backend controllers.
 *
 * The backend has no ESLint config, so two classes of mistake ship silently and
 * only fail at RUNTIME:
 *
 *   1. `req` referenced inside a function that never receives it.
 *      Origin: `createSingleSalesOrder(dbConnection, orderData, userId, company)`
 *      was given `readAppliedSchemes(req.body)`:
 *        ReferenceError: req is not defined
 *          at createSingleSalesOrder (controllers/salesOrderController.js:3945)
 *      Every createSalesOrderWithAutoSplit call crashed.
 *
 *   2. A model used but never destructured from `getModels(req.dbConnection)`.
 *      Origin: `getOverdueInvoices` called `DealerInvoice.find(...)` with no
 *      getModels at all; `checkIfDescendant()` referenced `ExtendedSubcategory`
 *      from module scope. 28 such sites were found across 5 files, each a
 *      guaranteed 500 on the endpoint that reached it.
 *
 * Both are found by scanning function bodies, so this file is a dependency-free
 * stand-in for `no-undef`. A fuller check is available too:
 *
 *   cd All-jainimpex-backend/crm_backend
 *   <frontend>/node_modules/.bin/eslint --no-config-lookup -c <inline config> controllers services ...
 *
 * Run: node utils/__scopeGuard.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');

let passed = 0;
let failed = 0;
const failures = [];

const section = (name) => console.log(`\n--- ${name} ---`);
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ''}`);
  }
};

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Blank comments and string literals, preserving LENGTH (and newlines) so line
 * numbers stay correct. Template literals keep their `${...}` expressions.
 */
const stripNonCode = (text) => {
  const out = text.split('');
  const n = text.length;
  const blank = (k) => { if (k < n && out[k] !== '\n') out[k] = ' '; };

  let i = 0;
  let mode = 'code';            // code | line | block | sq | dq | regex
  const stack = [];             // one frame per open template literal
  let prevSignificant = '';     // for the regex-vs-division heuristic

  const inTemplateLiteral = () => stack.length > 0 && stack[stack.length - 1].expr === 0;
  const REGEX_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    if (mode === 'line') {
      if (c === '\n') mode = 'code'; else blank(i);
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { blank(i); blank(i + 1); i += 2; mode = 'code'; continue; }
      blank(i);
      i += 1;
      continue;
    }
    if (mode === 'sq' || mode === 'dq') {
      if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (c === (mode === 'sq' ? "'" : '"')) { blank(i); i += 1; mode = 'code'; continue; }
      blank(i);
      i += 1;
      continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (c === '/') { blank(i); i += 1; mode = 'code'; continue; }
      blank(i);
      i += 1;
      continue;
    }

    // --- code, or the expression part of a template literal ---
    if (inTemplateLiteral()) {
      if (c === '\\') { blank(i); blank(i + 1); i += 2; continue; }
      if (c === '`') { stack.pop(); i += 1; continue; }
      if (c === '$' && c2 === '{') { stack[stack.length - 1].expr = 1; i += 2; continue; }
      blank(i);
      i += 1;
      continue;
    }

    if (c === '/' && c2 === '/') { blank(i); blank(i + 1); mode = 'line'; i += 2; continue; }
    if (c === '/' && c2 === '*') { blank(i); blank(i + 1); mode = 'block'; i += 2; continue; }
    if (c === '/' && REGEX_PRECEDERS.has(prevSignificant)) { blank(i); mode = 'regex'; i += 1; continue; }
    if (c === "'") { blank(i); mode = 'sq'; i += 1; continue; }
    if (c === '"') { blank(i); mode = 'dq'; i += 1; continue; }
    if (c === '`') { stack.push({ expr: 0 }); i += 1; continue; }

    if (stack.length > 0 && stack[stack.length - 1].expr > 0) {
      if (c === '{') stack[stack.length - 1].expr += 1;
      else if (c === '}') stack[stack.length - 1].expr -= 1;
    }

    if (!/\s/.test(c)) prevSignificant = c;
    i += 1;
  }

  return out.join('');
};

const HEADER = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{|(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{/g;

const matchBrace = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const findFunctions = (text, from, to) => {
  const out = [];
  const re = new RegExp(HEADER.source, 'g');
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index >= to) break;
    const name = m[1] || m[3] || '(anonymous)';
    const params = (m[2] !== undefined ? m[2] : m[4]) || '';
    const open = text.indexOf('{', re.lastIndex - 1);
    if (open === -1) continue;
    const close = matchBrace(text, open);
    if (close === -1 || close > to) continue;
    out.push({ name, params, headerAt: m.index, open, close });
    // Resume at the body brace. Advancing only past the header would re-match it,
    // because the leading `export ` is optional — that produced every function
    // twice and broke the self-tests.
    re.lastIndex = open;
  }
  return out;
};

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Text of module scope = everything outside the top-level function bodies. */
const moduleScopeText = (code, fns) => {
  const top = fns.filter((f) => !fns.some((g) => g !== f && g.open < f.open && g.close > f.close));
  const out = code.split('');
  for (const f of top) {
    for (let i = f.open; i <= f.close; i += 1) if (out[i] !== '\n') out[i] = ' ';
  }
  return out.join('');
};

/** Does a parameter list declare `name`? */
const paramsInclude = (params, name) =>
  new RegExp(`(^|[\\s,({[]])${name}([\\s,)}\\]:=]|$)`).test(params);

/** Is `name` declared somewhere in [from, to)? */
const isDeclaredIn = (code, name, from, to) => {
  const span = code.slice(from, to);
  // const { A, B } = ...   /   const [A] = ...
  for (const m of span.matchAll(/const\s*\{([^}]*)\}\s*=/g)) {
    if (new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(m[1])) return true;
  }
  for (const m of span.matchAll(/const\s*\[([^\]]*)\]\s*=/g)) {
    if (new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(m[1])) return true;
  }
  if (new RegExp(`(const|let|var)\\s+${name}\\s*[=;]`).test(span)) return true;
  if (new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`).test(span)) return true;
  if (new RegExp(`class\\s+${name}\\b`).test(span)) return true;
  // Parameters of any arrow function, so a concise-body helper that RECEIVES the
  // model (`const h = (M, id) => M.findById(id)`) counts as declaring it.
  for (const m of span.matchAll(/\(([^)]*)\)\s*=>/g)) {
    if (new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(m[1])) return true;
  }
  if (new RegExp(`(^|[\\s,;{(])${name}\\s*=>`).test(span)) return true;
  return false;
};

/** True when `name` is resolvable from inside `fn` (params, body, closure or module scope). */
const isResolvable = (code, name, fn, fns, moduleText) => {
  if (paramsInclude(fn.params, name)) return true;
  if (isDeclaredIn(code, name, fn.open, fn.close)) return true;

  for (const outer of fns) {
    if (outer === fn) continue;
    if (outer.open < fn.open && outer.close > fn.close) {
      if (paramsInclude(outer.params, name)) return true;
      if (isDeclaredIn(code, name, outer.open, fn.open)) return true;
    }
  }

  // Module scope (imports, top-level consts).
  if (isDeclaredIn(moduleText, name, 0, moduleText.length)) return true;
  return false;
};

// ---------------------------------------------------------------------------
// Self-test the scanner against snippets reproducing the real bugs.
// ---------------------------------------------------------------------------
section('the scanner itself (guards against a broken guard)');

const BUGGY_REQ = `
export async function createSingleSalesOrder(dbConnection, orderData, userId, company = null) {
  const appliedSelection = readAppliedSchemes(req.body);
  return appliedSelection;
}
`;
const FIXED_REQ = `
export async function createSingleSalesOrder(dbConnection, orderData, userId, company = null) {
  const appliedSelection = readAppliedSchemes(orderData);
  return appliedSelection;
}
`;
const NESTED_OK = `
export const makeHandler = (deps) => {
  const run = async (req, res) => {
    return req.body.value;
  };
  return run;
};
`;
const COMMENT_ONLY = `
export async function helper(a, b) {
  // this helper has no req in scope, so it reads from orderData instead
  return readAppliedSchemes(a);
}
`;
const STRING_ONLY = `
export function helper(a) {
  const label = "req.body is not available here";
  return label;
}
`;

const reqRefs = (code) => {
  const fns = findFunctions(code, 0, code.length);
  const hits = [];
  for (const fn of fns) {
    if (paramsInclude(fn.params, 'req')) continue;
    const nested = fns
      .filter((f) => f !== fn && f.headerAt > fn.open && f.close < fn.close)
      .filter((f) => !fns.some((g) => g !== fn && g !== f && g.headerAt > fn.open && g.headerAt < f.headerAt && g.close > f.close));
    const re = /\breq\b/g;
    re.lastIndex = fn.open;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (m.index >= fn.close) break;
      if (nested.some((f) => m.index >= f.headerAt && m.index <= f.close)) continue;
      hits.push(lineAt(code, m.index));
    }
  }
  return hits;
};

const strip = stripNonCode;
check('flags the original `req` bug', reqRefs(strip(BUGGY_REQ)).length === 1);
check('does not flag the fix', reqRefs(strip(FIXED_REQ)).length === 0);
check('does not flag a nested (req, res) handler', reqRefs(strip(NESTED_OK)).length === 0);
check('does not flag a comment mentioning req', reqRefs(strip(COMMENT_ONLY)).length === 0);
check('does not flag a string mentioning req', reqRefs(strip(STRING_ONLY)).length === 0);

// --- model usage ---
const MODEL_CALL = /\b([A-Z][A-Za-z0-9_]*)\s*\.\s*(find|findOne|findById|findOneAndUpdate|findByIdAndUpdate|findByIdAndDelete|findOneAndDelete|countDocuments|aggregate|create|insertMany|updateMany|updateOne|deleteOne|deleteMany|distinct|bulkWrite|exists)\b/g;

/** Built-ins whose methods collide with the mongoose names above (`Object.create`). */
const BUILTIN_RECEIVERS = new Set([
  'Object', 'Array', 'Number', 'String', 'Boolean', 'Promise', 'JSON', 'Math', 'Date',
  'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt', 'Reflect',
  'Proxy', 'Buffer', 'URL', 'Intl', 'Atomics', 'console'
]);

const modelRefs = (code) => {
  const fns = findFunctions(code, 0, code.length);
  const moduleText = moduleScopeText(code, fns);
  const hits = [];

  for (const fn of fns) {
    const nested = fns
      .filter((f) => f !== fn && f.headerAt > fn.open && f.close < fn.close)
      .filter((f) => !fns.some((g) => g !== fn && g !== f && g.headerAt > fn.open && g.headerAt < f.headerAt && g.close > f.close));
    const re = new RegExp(MODEL_CALL.source, 'g');
    re.lastIndex = fn.open;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (m.index >= fn.close) break;
      if (nested.some((f) => m.index >= f.headerAt && m.index <= f.close)) continue;
      const name = m[1];
      if (BUILTIN_RECEIVERS.has(name)) continue;
      if (isResolvable(code, name, fn, fns, moduleText)) continue;
      hits.push(`${name} (line ${lineAt(code, m.index)}) near: ${JSON.stringify(code.slice(m.index, m.index + 45))}`);
    }
  }

  // Module scope too: a concise-arrow helper (`const h = (id) => M.findById(id)`)
  // has no body brace, so it is not a "function" above — but it still must not
  // reference a model it never declared or imported.
  const moduleRe = new RegExp(MODEL_CALL.source, 'g');
  let mm;
  while ((mm = moduleRe.exec(moduleText)) !== null) {
    const name = mm[1];
    if (BUILTIN_RECEIVERS.has(name)) continue;
    if (isDeclaredIn(moduleText, name, 0, moduleText.length)) continue;
    hits.push(`${name} (module scope, line ${lineAt(code, mm.index)}) near: ${JSON.stringify(code.slice(mm.index, mm.index + 45))}`);
  }

  return hits;
};

const BUGGY_MODEL = `
export const getOverdueInvoices = async (req, res) => {
  try {
    const today = new Date();
    const overdueInvoices = await DealerInvoice.find({ dealer: req.params.dealerId });
    return overdueInvoices;
  } catch (e) { return res.status(500).json({}); }
};
`;
const FIXED_MODEL = `
export const getOverdueInvoices = async (req, res) => {
  try {
    const { DealerInvoice } = getModels(req.dbConnection);
    const overdueInvoices = await DealerInvoice.find({ dealer: req.params.dealerId });
    return overdueInvoices;
  } catch (e) { return res.status(500).json({}); }
};
`;
const HELPER_MODEL_OK = `
const helper = (ExtendedSubcategory, id) => ExtendedSubcategory.findById(id);
`;
const HELPER_MODEL_BAD = `
const helper = (id) => ExtendedSubcategory.findById(id);
`;
const MODULE_CONST_OK = `
import mongoose from 'mongoose';
const Local = mongoose.model('Local', {});
export const use = async (req, res) => Local.findById(req.params.id);
`;

// A backtick INSIDE a line comment must not open a template literal — if it did,
// the rest of the file would be treated as string content and every real problem
// after it would be silently skipped.
const BACKTICK_IN_COMMENT = `
export const getOptions = async (req, res) => {
  const { Scheme } = getModels(req.dbConnection);
  // These used to be \`SchemeApplication.distinct('routeName')\` — bare names.
  const rows = await Scheme.find({});
  return rows;
};
`;
const TEMPLATE_WITH_EXPR = `
export const send = async (req, res) => {
  const { Dealer } = getModels(req.dbConnection);
  const dealer = await Dealer.findById(req.params.id);
  res.json({ message: \`Hello \${dealer.name}\` });
};
`;
// A NESTED template literal — this is what desynced the first stripper. It reset
// the depth to 1 on every \`\${ \`, so the inner template's closing backtick was read
// as the outer one and the rest of the file was treated as string content.
const NESTED_TEMPLATE = `
export const describe = (slab, next) => {
  return \`Slab \${slab.from}-\${slab.to}\${slab.label ? \` (\${slab.label})\` : ''} overlaps \${next.from}\`;
};
export const load = async (req, res) => {
  const { Scheme } = getModels(req.dbConnection);
  const rows = await Scheme.find({});
  return rows;
};
`;
// A regex literal containing characters that look like comment/string starts.
const REGEX_LITERAL = `
export const esc = (v) => String(v ?? '').replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
export const load = async (req, res) => {
  const { Scheme } = getModels(req.dbConnection);
  return Scheme.find({});
};
`;

check('flags a model used with no getModels', modelRefs(strip(BUGGY_MODEL)).length === 1,
  `found ${JSON.stringify(modelRefs(strip(BUGGY_MODEL)))}`);
check('does not flag the fixed version', modelRefs(strip(FIXED_MODEL)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(FIXED_MODEL)))}`);
check('accepts a model passed as a parameter', modelRefs(strip(HELPER_MODEL_OK)).length === 0);
check('flags a module-scope model inside a helper', modelRefs(strip(HELPER_MODEL_BAD)).length === 1,
  `found ${JSON.stringify(modelRefs(strip(HELPER_MODEL_BAD)))}`);
check('accepts a module-level const model', modelRefs(strip(MODULE_CONST_OK)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(MODULE_CONST_OK)))}`);
check('a backtick inside a comment does not desync the stripper',
  modelRefs(strip(BACKTICK_IN_COMMENT)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(BACKTICK_IN_COMMENT)))}`);
check('a template literal with an expression keeps its code',
  modelRefs(strip(TEMPLATE_WITH_EXPR)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(TEMPLATE_WITH_EXPR)))}`);
check('a NESTED template literal does not desync the stripper',
  modelRefs(strip(NESTED_TEMPLATE)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(NESTED_TEMPLATE)))}`);
check('a regex literal does not desync the stripper',
  modelRefs(strip(REGEX_LITERAL)).length === 0,
  `found ${JSON.stringify(modelRefs(strip(REGEX_LITERAL)))}`);
// And the stripper must still SEE a real problem AFTER a nested template.
const AFTER_NESTED = `${NESTED_TEMPLATE}
export const bad = async (req, res) => {
  const rows = await Ghost.find({});
  return rows;
};
`;
check('still detects a problem that comes after a nested template',
  modelRefs(strip(AFTER_NESTED)).length === 1,
  `found ${JSON.stringify(modelRefs(strip(AFTER_NESTED)))}`);

// ---------------------------------------------------------------------------
// The real controllers.
// ---------------------------------------------------------------------------
const FILES = [
  'controllers/salesOrderController.js',
  'controllers/dealerInvoiceController.js',
  'controllers/schemeController.js',
  'controllers/supplierInvoiceController.js',
  'controllers/grnController.js',
  'controllers/pointsController.js',
  'controllers/dealerPaymentController.js',
  'controllers/dealerPricingController.js',
  'controllers/extendedSubcategoryController.js',
  'controllers/stockController.js',
  'middleware/uploadErrorHandler.js'
];

for (const rel of FILES) {
  const abs = path.join(BACKEND, rel);
  if (!fs.existsSync(abs)) {
    check(`${rel} exists`, false);
    continue;
  }
  const code = stripNonCode(fs.readFileSync(abs, 'utf8'));
  const fns = findFunctions(code, 0, code.length);

  section(rel);
  check('scanned at least one function', fns.length > 0, `found ${fns.length}`);

  const reqOffenders = reqRefs(code).map((line) => `line ${line}`);
  check('no `req` outside a function that receives it', reqOffenders.length === 0,
    reqOffenders.slice(0, 8).join('\n         '));

  const modelOffenders = modelRefs(code);
  check('no model used without being resolved', modelOffenders.length === 0,
    modelOffenders.slice(0, 12).join('\n         '));
}

// ---------------------------------------------------------------------------
// Guard 3: populate() refs must be registered on the company connection.
//
// `populate(path)` resolves the target model from the CONNECTION registry
// (`conn.model(refName)`), NOT from the schema that declares the ref. A
// controller that populates a path whose `ref:` points at a model it never
// registers through its local `getModels()` throws at runtime:
//
//   MissingSchemaError: Schema hasn't been registered for model "ServiceChargeMaster".
//     at _getModelFromConn (.../mongoose/lib/helpers/populate/getModelsMapForPopulate.js)
//
// Whether it throws depends on whether some OTHER controller already registered
// that model on the same connection -- so it works until the first request that
// arrives before accountingService runs. That is exactly how
// GET /api/dealer-invoices/:id began 500ing with "Server error while fetching
// dealer invoice": dealerInvoiceController populated
// serviceCharges.serviceChargeId (ref "ServiceChargeMaster") without
// registering it. supplierInvoiceController carried the same latent bug.
//
// To resolve a populate path like "serviceCharges.serviceChargeId" to its ref
// name we must follow the SCHEMA, not the path string: look up the model whose
// schema declares that array field, then read the `ref:` on the sub-field.
// ---------------------------------------------------------------------------

const POPULATE_FILES = [
  'controllers/salesOrderController.js',
  'controllers/dealerInvoiceController.js',
  'controllers/supplierInvoiceController.js',
  'controllers/grnController.js',
  'controllers/purchaseOrderController.js',
  'controllers/schemeController.js',
  'controllers/dealerPaymentController.js',
  'controllers/stockController.js'
];

/**
 * Build an index of every `ref:` declared anywhere under `models/`:
 *   "<fieldName>": -> ref name, e.g. "serviceChargeId" -> "ServiceChargeMaster".
 * Also indexes array fields so we can walk "serviceCharges.serviceChargeId".
 */
const buildRefIndex = () => {
  const modelsDir = path.join(BACKEND, 'models');
  const fieldToRef = new Map();        // fieldName -> Set(refName)
  const arrayFieldsToArrayModel = new Map(); // arrayFieldName -> Set(schema field keys)

  for (const entry of fs.readdirSync(modelsDir)) {
    if (!entry.endsWith('.js')) continue;
    // NOTE: read the RAW source here, not stripNonCode'd. The ref NAME lives
    // inside a string literal ("ServiceChargeMaster"); the stripper blanks
    // string contents by design, which would erase exactly what we need.
    const src = fs.readFileSync(path.join(modelsDir, entry), 'utf8');

    // `ref: "ModelName"` (also handles ref: 'X')
    const refRe = /(\w+)\s*:\s*\{[^{}]*?\bref\s*:\s*['"`]([A-Za-z_$][\w$]*)['"`]/gs;
    let rm;
    while ((rm = refRe.exec(src)) !== null) {
      const [, field, refName] = rm;
      if (!fieldToRef.has(field)) fieldToRef.set(field, new Set());
      fieldToRef.get(field).add(refName);
    }

    // Array-of-object fields, to walk "a.b" paths: capture their field names.
    const arrRe = /(\w+)\s*:\s*\[\s*\{/g;
    let am;
    while ((am = arrRe.exec(src)) !== null) {
      arrayFieldsToArrayModel.set(am[1], true);
    }
  }
  return { fieldToRef, arrayFieldsToArrayModel };
};

// How many distinct source files must register a model before we treat it as
// "reliably present" on any company connection? Models like User (11 files),
// Brand (12), Product (25) are registered by so many common code paths that a
// request always finds them on the connection. A model registered in only one
// or two rarely-hit files (ServiceChargeMaster: 2, both deep in accounting) is
// a real hazard: populate() can easily run before anything registered it.
const MIN_REGISTRARS = 3;

/**
 * Index every `dbConnection.model('Name', ...)` registration, mapping the model
 * name to the set of files that register it.
 */
const buildRegistrarIndex = () => {
  const registrars = new Map();
  const dirs = ['controllers', 'services', 'middleware', 'utils'];
  const walk = (dir) => {
    const abs = path.join(BACKEND, dir);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs)) {
      const rel = `${dir}/${entry}`;
      const full = path.join(abs, entry);
      if (!fs.statSync(full).isFile() || !entry.endsWith('.js')) continue;
      const src = fs.readFileSync(full, 'utf8');
      const re = /dbConnection\.model\(\s*['"`]([A-Za-z_$][\w$]*)['"`]/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        if (!registrars.has(m[1])) registrars.set(m[1], new Set());
        registrars.get(m[1]).add(rel);
      }
    }
  };
  for (const d of dirs) walk(d);
  return registrars;
};

const registrars = buildRegistrarIndex();
const { fieldToRef } = buildRefIndex();

/**
 * Resolve a populate path to the model name(s) it needs registered.
 * "serviceCharges.serviceChargeId" -> ["ServiceChargeMaster"]
 * Returns [] when we cannot determine it (never a false positive).
 */
const resolvePopulateRef = (populatePath) => {
  const segments = populatePath.split('.').map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const refs = fieldToRef.get(segments[i]);
    if (refs && refs.size > 0) return [...refs];
  }
  return [];
};

/** Every populate() path in a file, with its line number. */
const populatePaths = (code) => {
  const paths = [];
  const lines = [];
  const re = /\.populate\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    paths.push(m[1]);
    lines.push(code.slice(0, m.index).split('\n').length);
  }
  return { paths, lines };
};

section('populate() ref registration');

for (const rel of POPULATE_FILES) {
  const abs = path.join(BACKEND, rel);
  if (!fs.existsSync(abs)) continue;
  // Raw source: the populate PATH is a string literal and stripNonCode blanks
  // string contents, so scanning the stripped text would find nothing.
  const raw = fs.readFileSync(abs, 'utf8');
  const code = stripNonCode(raw);
  const { paths, lines } = populatePaths(raw);
  if (paths.length === 0) continue;

  const risky = [];
  for (let i = 0; i < paths.length; i += 1) {
    const refNames = resolvePopulateRef(paths[i]);
    for (const refName of refNames) {
      const registeredHere = new RegExp(`\\b${refName}\\b`).test(code);
      if (registeredHere) continue;

      // Not registered here AND only a handful of files register it anywhere
      // -> this populate() can genuinely fail with MissingSchemaError.
      const registrarCount = (registrars.get(refName) || new Set()).size;
      if (registrarCount < MIN_REGISTRARS) {
        risky.push(
          `populate("${paths[i]}") needs "${refName}" `
          + `(line ${lines[i]}; registered in only ${registrarCount} file(s))`
        );
      }
    }
  }

  check(`${rel}: no under-registered populate() ref`, risky.length === 0,
    risky.slice(0, 10).join('\n         '));
}

// ---------------------------------------------------------------------------
// Guard 4: `creditDays` must never fall through on a genuine 0.
//
// `Dealer.creditDays` / `creditDaysRegular` / `creditDaysCD` all default to 0,
// and 0 means "pay on demand" — a real answer, not "unset". A `||` chain that
// ends in a NON-ZERO default silently upgrades every pay-on-demand dealer to
// that many days, and `creditDays` sets `dueDate`, which the aging report
// buckets on. `|| 0` is harmless (0 maps to 0); `|| <nonzero>` is the bug.
//
// Scans RAW source: `stripNonCode` blanks string literals, so scanning the
// stripped text would not see the default value.
//
// The fallback may be a LITERAL (|| 30) or an IDENTIFIER (|| creditDays, where
// the caller's own default is 30) — both are the bug. Only a literal 0 is safe.
// ---------------------------------------------------------------------------
section('creditDays: no `|| <nonzero>` fallthrough');

const CREDIT_DAY_FILES = [
  'controllers/salesOrderController.js',
  'controllers/dealerInvoiceController.js',
  'models/DealerInvoice.js',
  'models/SalesOrder.js',
  'models/SupplierInvoice.js',
  'controllers/dealerPaymentController.js',
  'controllers/agingReportController.js'
];

// Final operands that are LEGITIMATE as a fallback.
const ALLOWED_IDENTIFIER_FALLBACKS = new Set(['null', 'undefined']);

// A `creditDays*` FALLBACK CHAIN looks like:
//     <expr involving creditDays> ( || <operand> )+
// What matters is the LAST operand — that is the value a genuine 0 falls
// through TO. A bare identifier in the MIDDLE is just the next candidate in the
// chain (`a.creditDaysRegular || b.creditDays || 0`), not a default.
//
// Matching the whole chain and reading its final operand avoids the false
// positive that a naive `creditDays* || <x>` scan produces on that line.
//
// The identifier set is deliberately EXACT: `creditDays`, `creditDaysRegular`
// and `creditDaysCD` are day COUNTS. `creditDaysChanged` (a boolean flag) and
// `creditDaysRange` (a filter string) are not, and matching them produced a
// false positive on a boolean condition.
const CREDIT_DAY_CHAIN = /\b(?:creditDays|creditDaysRegular|creditDaysCD|creditDaysApplied)\b(?:\s*\|\|[^|;\n]+)+/g;

// The final operand of a matched chain, trimmed.
const lastOperand = (chain) => {
  const parts = chain.split('||');
  return parts[parts.length - 1].trim();
};

// Operands that are harmless as a final fallback.
const isHarmlessFallback = (operand) => {
  if (operand === '0') return true;                       // 0 maps to 0
  if (ALLOWED_IDENTIFIER_FALLBACKS.has(operand)) return true; // null / undefined
  return false;
};

const creditOffenders = [];
for (const rel of CREDIT_DAY_FILES) {
  const abs = path.join(BACKEND, rel);
  if (!fs.existsSync(abs)) continue;
  const raw = fs.readFileSync(abs, 'utf8');
  raw.split('\n').forEach((line, idx) => {
    // Ignore comment-only lines so documenting the anti-pattern is fine.
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    // Ignore lines that route through the shared helper — those are the fix.
    if (trimmed.includes('resolveCreditDays') || trimmed.includes('addCreditDays')) return;

    // Form A: a `||` fallback chain whose FINAL operand is a non-zero default.
    CREDIT_DAY_CHAIN.lastIndex = 0;
    let m;
    let flagged = false;
    while ((m = CREDIT_DAY_CHAIN.exec(line)) !== null) {
      if (isHarmlessFallback(lastOperand(m[0]))) continue;
      creditOffenders.push(`${rel}:${idx + 1}  ${trimmed}`);
      flagged = true;
      break; // one report per line is enough
    }
    if (flagged) return;

    // Form B: a TRUTHINESS GUARD on the day count — `&& this.creditDays` as a
    // condition. 0 is falsy, so this SKIPS the assignment for a pay-on-demand
    // dealer and leaves the field unset. The fix is an explicit null/undefined
    // check, so any bare `&& creditDays` (not followed by a comparison) is a
    // finding. `creditDaysChanged`/`creditDaysRange` are not day counts.
    const TRUTHY_GUARD = /&&\s*(?:this\.)?(?:creditDays|creditDaysRegular|creditDaysCD)\b(?!\s*(?:!==|===|!=|==|>|<))/;
    if (TRUTHY_GUARD.test(line)) {
      creditOffenders.push(`${rel}:${idx + 1}  ${trimmed}  (truthiness guard on a day count)`);
    }
  });
}

check('no creditDays value silently falls through to a non-zero default',
  creditOffenders.length === 0,
  creditOffenders.slice(0, 8).join('\n         '));

// The shared owner of the rule must exist and be the one the controllers use.
const creditTermsPath = path.join(BACKEND, 'utils', 'creditTerms.js');
check('utils/creditTerms.js exists (the single owner of the rule)',
  fs.existsSync(creditTermsPath));

// Self-tests: the scanner must FLAG the historical bug forms and must NOT flag
// the harmless forms — otherwise this guard passes vacuously either way.
// Reuse the exact scanner predicate so the self-test cannot drift from it.
const scannerFlags = (sample) => {
  CREDIT_DAY_CHAIN.lastIndex = 0;
  let m;
  while ((m = CREDIT_DAY_CHAIN.exec(sample)) !== null) {
    if (!isHarmlessFallback(lastOperand(m[0]))) return true;
  }
  return false;
};

check('self-test: flags `|| 30`', scannerFlags('a.creditDaysRegular || b.creditDays || 30'));
check('self-test: flags `|| creditDays` (identifier fallback)',
  scannerFlags('dealer.creditDaysCD || dealer.creditDays || creditDays'));
check('self-test: flags the model-hook form', scannerFlags('invoice.creditDays || 30'));
check('self-test: allows the harmless `|| 0` form',
  !scannerFlags('a.creditDaysRegular || b.creditDays || 0'));
check('self-test: allows a chain whose middle operand is an identifier',
  !scannerFlags('dealer.creditDaysRegular || dealer.creditDays || 0'));

// Self-test for Form B (truthiness guard).
const TRUTHY_GUARD_SELF = /&&\s*(?:this\.)?(?:creditDays|creditDaysRegular|creditDaysCD)\b(?!\s*(?:!==|===|!=|==|>|<))/;
check('self-test: flags a truthiness guard on a day count',
  TRUTHY_GUARD_SELF.test('if (this.invoiceDate && this.creditDays) {'));
check('self-test: allows an explicit null/undefined check',
  !TRUTHY_GUARD_SELF.test('if (this.invoiceDate && this.creditDays !== null && this.creditDays !== undefined) {'));
check('self-test: ignores a boolean flag named creditDaysChanged',
  !TRUTHY_GUARD_SELF.test('&& (orderDateChanged || creditDaysChanged || !salesOrder.dueDate)'));

// ---------------------------------------------------------------------------
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
