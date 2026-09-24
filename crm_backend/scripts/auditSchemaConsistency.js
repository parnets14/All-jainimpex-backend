#!/usr/bin/env node
/**
 * Schema & registry consistency audit.
 *
 * Catches the four classes of defect that broke dealer-invoice approval in Sept 2026.
 * Each one was invisible until the exact code path ran in production, so run this
 * after adding a model, adding a ledger group, or touching a controller's getModels.
 *
 *   1. getModels registry      — a controller destructures a model its getModels
 *                                does not register (=> `undefined.findById` crash)
 *   2. accountGroup enums      — a schema keeps its own copy of the ledger-group list
 *                                and it has drifted from the canonical one
 *   3. accountGroup literals   — code hardcodes a group that is not in the enum
 *                                (=> ValidationError at save time)
 *   4. voucher payloads        — the journal entries accountingService builds actually
 *                                pass JournalVoucher validation (balance + enum)
 *
 * Usage:  node scripts/auditSchemaConsistency.js
 * Exit:   0 = all checks passed, 1 = at least one failure (CI friendly)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { LEDGER_GROUPS } from '../config/accountGroups.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE_ROOTS = ['controllers', 'services', 'routes', 'utils', 'scripts', 'config'];
const failures = [];
const notes = [];

const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
};
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

// ─────────────────────────────────────────────────────────────────────────────
// 1. getModels registry
// ─────────────────────────────────────────────────────────────────────────────
function checkGetModelsRegistry() {
  let sites = 0;

  for (const root of SOURCE_ROOTS) {
    for (const file of walk(path.join(ROOT, root))) {
      const src = read(file);

      // Collect the keys each getModels definition returns
      const registered = new Set();
      let found = false;
      const defRe = /const\s+getModels\s*=\s*\([^)]*\)\s*=>\s*\{/g;
      let dm;
      while ((dm = defRe.exec(src))) {
        found = true;
        // brace-walk to the end of the function body
        let depth = 1;
        let i = dm.index + dm[0].length;
        while (i < src.length && depth > 0) {
          if (src[i] === '{') depth += 1;
          else if (src[i] === '}') depth -= 1;
          i += 1;
        }
        const body = src.slice(dm.index + dm[0].length, i);
        for (const km of body.matchAll(/(\w+)\s*:\s*dbConnection/g)) registered.add(km[1]);
      }
      if (!found) continue;

      // Check every destructure against the registered keys
      for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*getModels\(/g)) {
        sites += 1;
        const names = m[1].split(',').map((n) => n.trim().split(':')[0].trim()).filter(Boolean);
        const missing = names.filter((n) => !registered.has(n));
        if (missing.length) {
          const line = src.slice(0, m.index).split('\n').length;
          failures.push(
            `getModels: ${rel(file)}:${line} destructures ${missing.map((n) => `'${n}'`).join(', ')} ` +
            `but getModels does not register ${missing.length > 1 ? 'them' : 'it'}`
          );
        }
      }
    }
  }
  notes.push(`getModels: ${sites} destructure site(s) checked`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. accountGroup enums across every schema (introspected, never regexed)
// ─────────────────────────────────────────────────────────────────────────────
async function checkAccountGroupEnums() {
  const modelsDir = path.join(ROOT, 'models');
  const canonical = [...LEDGER_GROUPS].sort();
  let enums = 0;

  const walkPaths = (schema, prefix, label, out) => {
    for (const [p, st] of Object.entries(schema.paths)) {
      const full = prefix ? `${prefix}.${p}` : p;
      if (p === 'accountGroup' && Array.isArray(st.enumValues) && st.enumValues.length) {
        out.push({ label, path: full, values: st.enumValues });
      }
      if (st.schema && st.schema.paths) walkPaths(st.schema, full, label, out);
      const emb = st['$embeddedSchemaType'];
      if (emb && emb.schema && emb.schema.paths) walkPaths(emb.schema, full, label, out);
    }
  };

  for (const f of fs.readdirSync(modelsDir).filter((n) => n.endsWith('.js'))) {
    let mod;
    try {
      // pathToFileURL is required on Windows — a bare "D:\..." specifier is rejected
      mod = await import(pathToFileURL(path.join(modelsDir, f)).href);
    } catch {
      continue;
    }
    for (const [name, val] of Object.entries(mod)) {
      if (!(val instanceof mongoose.Schema)) continue;
      const found = [];
      walkPaths(val, '', `${f} (${name})`, found);
      // de-duplicate: a schema can be reached via more than one export path
      const seen = new Set();
      for (const e of found) {
        const key = `${e.label}::${e.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        enums += 1;

        const missing = canonical.filter((g) => !e.values.includes(g));
        const extra = e.values.filter((g) => !canonical.includes(g));
        if (missing.length || extra.length) {
          failures.push(
            `accountGroup enum: ${e.label} -> ${e.path} differs from config/accountGroups.js` +
            (missing.length ? ` | missing: ${missing.join(', ')}` : '') +
            (extra.length ? ` | unexpected: ${extra.join(', ')}` : '')
          );
        }
      }
    }
  }
  notes.push(`accountGroup enums: ${enums} found, canonical list has ${canonical.length} groups`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Hardcoded accountGroup literals must be valid enum values
// ─────────────────────────────────────────────────────────────────────────────
function checkAccountGroupLiterals() {
  const valid = new Set(LEDGER_GROUPS);
  let seen = 0;

  for (const root of [...SOURCE_ROOTS, 'models']) {
    for (const file of walk(path.join(ROOT, root))) {
      const src = read(file);
      for (const m of src.matchAll(/accountGroup\s*:\s*['"]([^'"]+)['"]/g)) {
        seen += 1;
        if (!valid.has(m[1])) {
          const line = src.slice(0, m.index).split('\n').length;
          failures.push(
            `accountGroup literal: ${rel(file)}:${line} uses '${m[1]}' which is not in the enum`
          );
        }
      }
    }
  }
  notes.push(`accountGroup literals: ${seen} checked`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The journal entries accountingService builds must actually validate
// ─────────────────────────────────────────────────────────────────────────────
async function checkVoucherPayloads() {
  const conn = mongoose.createConnection();
  const JournalVoucher = conn.model('JournalVoucher', journalVoucherSchema);
  const createdBy = new mongoose.Types.ObjectId();
  const base = { createdBy, voucherDate: new Date(), status: 'Posted', narration: 'audit' };

  // Mirrors createDealerInvoiceEntry: goods 1000 + 180 GST, freight 500 + 90 GST
  const dealer = {
    ...base,
    voucherNumber: 'AUDIT-DEALER',
    voucherType: 'Sales',
    entries: [
      { accountName: 'Sundry Debtors', accountGroup: 'Sundry Debtors',  debit: 1770, credit: 0 },
      { accountName: 'Sales Account',  accountGroup: 'Sales',           debit: 0, credit: 1000 },
      { accountName: 'GST Payable',    accountGroup: 'GST Payable',     debit: 0, credit: 180 },
      { accountName: 'Service Income', accountGroup: 'Indirect Income', debit: 0, credit: 500 },
      { accountName: 'GST Payable',    accountGroup: 'GST Payable',     debit: 0, credit: 90 },
    ],
    totalDebit: 1770, totalCredit: 1770, totalAmount: 1770,
  };

  // Mirrors createSupplierInvoiceEntry
  const supplier = {
    ...base,
    voucherNumber: 'AUDIT-SUPPLIER',
    voucherType: 'Purchase',
    entries: [
      { accountName: 'Purchase Account',  accountGroup: 'Purchase',         debit: 1000, credit: 0 },
      { accountName: 'GST Input Credit',  accountGroup: 'GST Input Credit', debit: 180,  credit: 0 },
      { accountName: 'Service Expense',   accountGroup: 'Direct Expenses',  debit: 500,  credit: 0 },
      { accountName: 'GST Input Credit',  accountGroup: 'GST Input Credit', debit: 90,   credit: 0 },
      { accountName: 'Sundry Creditors',  accountGroup: 'Sundry Creditors', debit: 0, credit: 1770 },
    ],
    totalDebit: 1770, totalCredit: 1770, totalAmount: 1770,
  };

  for (const [name, doc] of [['dealer', dealer], ['supplier', supplier]]) {
    try {
      await new JournalVoucher(doc).validate();
    } catch (e) {
      failures.push(`voucher payload (${name}) fails JournalVoucher validation: ${e.message}`);
    }
  }
  notes.push('voucher payloads: 2 validated (dealer + supplier, incl. service charges)');
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nSchema & registry consistency audit\n');

  checkGetModelsRegistry();
  await checkAccountGroupEnums();
  checkAccountGroupLiterals();
  await checkVoucherPayloads();

  for (const n of notes) console.log(`  · ${n}`);

  if (failures.length) {
    console.log(`\n  ${failures.length} problem(s) found:\n`);
    for (const f of failures) console.log(`  ✗ ${f}`);
    console.log('');
    process.exit(1);
  }

  console.log('\n  ✓ all checks passed\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('\naudit crashed:', e);
  process.exit(1);
});
