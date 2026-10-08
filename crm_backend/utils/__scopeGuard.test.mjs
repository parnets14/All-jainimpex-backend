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
console.log(`\n================ ${passed} passed, ${failed} failed ================`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log('');
process.exit(failed === 0 ? 0 : 1);
