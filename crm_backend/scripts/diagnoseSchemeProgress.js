/**
 * Diagnose why a scheme shows no progress.
 *
 * Answers, for real data, the only question that matters: "for this order, which
 * schemes matched, how many lines qualified, and what would be recorded?"
 *
 * It walks the SAME code the live path runs — `enrichLinesWithProductScope` →
 * `evaluateSchemes` — and prints every intermediate value, so a mismatch is
 * visible instead of guessed at. Read-only: it writes nothing.
 *
 * Run:
 *   node scripts/diagnoseSchemeProgress.js                       # last 10 orders
 *   node scripts/diagnoseSchemeProgress.js --order=SO-2026-0017
 *   node scripts/diagnoseSchemeProgress.js --dealer=<dealerId>
 *   node scripts/diagnoseSchemeProgress.js --company=jain-impex --orders=25
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { salesOrderSchema } from '../models/SalesOrder.js';
import { schemeSchema } from '../models/Scheme.js';
import { schemeProgressSchema } from '../models/SchemeProgress.js';
import { productSchema } from '../models/Product.js';
import schemeEngine from '../services/schemeEngine.js';

dotenv.config();

const args = process.argv.slice(2);
const argOf = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const SPECIFIC_COMPANY = argOf('company');
const ORDER_NUMBER = argOf('order');
const DEALER_ID = argOf('dealer');
const LIMIT = Number(argOf('orders')) || 10;

const getModels = (dbConnection) => ({
  SalesOrder: dbConnection.models.SalesOrder || dbConnection.model('SalesOrder', salesOrderSchema),
  Scheme: dbConnection.models.Scheme || dbConnection.model('Scheme', schemeSchema),
  SchemeProgress: dbConnection.models.SchemeProgress
    || dbConnection.model('SchemeProgress', schemeProgressSchema),
  Product: dbConnection.models.Product || dbConnection.model('Product', productSchema)
});

const linesFromOrder = (order) => (order.products || []).map((p) => ({
  product: p.product,
  productCode: p.productCode,
  productName: p.productName,
  salesType: order.salesType,
  quantity: p.quantity,
  unitPrice: p.unitPrice,
  amount: p.totalPrice ?? (Number(p.unitPrice || 0) * Number(p.quantity || 0))
}));

const short = (id) => (id ? String(id).slice(-8) : '—');

async function diagnoseCompany(company) {
  const dbConnection = await getCompanyConnection(company);
  if (!dbConnection) {
    console.log(`   ⚠️  no connection for ${company} — skipped`);
    return;
  }

  const { SalesOrder, Scheme, SchemeProgress, Product } = getModels(dbConnection);

  const query = {};
  if (ORDER_NUMBER) query.orderNumber = ORDER_NUMBER;
  if (DEALER_ID) query.dealer = DEALER_ID;
  if (!ORDER_NUMBER && !DEALER_ID) {
    query['appliedSchemes.0'] = { $exists: true };
  }

  const orders = await SalesOrder.find(query)
    .select('orderNumber orderGroupId dealer dealerName status salesType products appliedSchemes createdAt')
    .sort({ createdAt: -1 })
    .limit(LIMIT)
    .lean();

  console.log(`   ${orders.length} order(s) to inspect`);
  if (orders.length === 0) return;

  const allSchemes = await Scheme.find({ appliesTo: 'dealer' })
    .select('schemeCode schemeName status validFrom validTo scope condition slabs productSlabs dealerScope')
    .lean();
  console.log(`   ${allSchemes.length} dealer scheme(s) configured\n`);

  for (const order of orders) {
    console.log('─'.repeat(78));
    console.log(`📦 ${order.orderNumber}  ·  ${order.dealerName || ''}  ·  ${order.status || ''}`);
    console.log(`   dealer: ${order.dealer}   created: ${order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : '—'}`);

    const selected = (order.appliedSchemes || [])
      .map((r) => `${r.schemeCode || ''}(${r.eligibleAtOrder ? 'eligible' : 'in progress'})`)
      .join(', ');
    console.log(`   ticked on the order: ${selected || '(none)'}`);

    const lines = linesFromOrder(order);
    console.log(`\n   raw lines from the order (what the DB stores):`);
    for (const l of lines) {
      console.log(`     · product=${short(l.product)} qty=${l.quantity} amount=${l.amount}`);
    }

    // What the engine sees AFTER the fix.
    const enriched = await schemeEngine.enrichLinesWithProductScope(dbConnection, lines);
    console.log(`\n   after enrichLinesWithProductScope (what the matcher uses):`);
    const productIds = [...new Set(lines.map((l) => l.product).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } })
      .select('itemName brand category subcategory')
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    for (const l of enriched) {
      const n = schemeEngine.normalizeLine(l);
      const p = byId.get(String(n.productId));
      console.log(`     · ${p?.itemName || n.productName || '(unknown product)'} qty=${n.quantity}`);
      console.log(`       brandId=${short(n.brandId)}  categoryId=${short(n.categoryId)}  subcategoryId=${short(n.subcategoryId)}`);
      if (!n.brandId) {
        console.log('       ⚠️  NO BRAND resolved — a brand-scoped scheme cannot match this line');
      }
    }

    // Which schemes match, and why not.
    const at = order.createdAt ? new Date(order.createdAt) : new Date();
    const evaluated = schemeEngine.evaluateSchemes({
      schemes: allSchemes,
      dealer: { _id: order.dealer, name: order.dealerName },
      lines: enriched,
      at
    });
    const evaluatedIds = new Set(evaluated.map((e) => String(e.schemeId)));

    console.log(`\n   scheme matching at the order date (${at.toISOString().slice(0, 10)}):`);
    for (const scheme of allSchemes) {
      const matched = evaluatedIds.has(String(scheme._id));
      const scopeDesc = scheme.scope?.level === 'all'
        ? 'all products'
        : `${scheme.scope?.level}:${short(scheme.scope?.[scheme.scope?.level])}`;
      const live = schemeEngine.schemeIsLive(scheme, at);
      const entry = evaluated.find((e) => String(e.schemeId) === String(scheme._id));
      let verdict;
      if (!live) verdict = `❌ not live on that date (status ${scheme.status})`;
      else if (!matched) verdict = '❌ scope matched NO line';
      else verdict = `✅ ${entry.qualifyingLines.length} qualifying line(s), measured ${entry.measuredValue}, eligible=${entry.eligible}`;
      console.log(`     ${scheme.schemeCode} [${scopeDesc}] ${verdict}`);
    }

    // What is actually banked right now.
    const buckets = await SchemeProgress.find({ dealer: order.dealer })
      .select('scheme schemeCode basis measuredQuantity measuredAmount achievements nextSlabFrom contributions')
      .lean();
    console.log(`\n   banked progress for this dealer (${buckets.length} bucket(s)):`);
    if (buckets.length === 0) {
      console.log('     (none — nothing has ever been recorded for this dealer)');
    }
    for (const b of buckets) {
      console.log(`     · ${b.schemeCode} measuredQty=${b.measuredQuantity} measuredAmt=${b.measuredAmount} contributions=${(b.contributions || []).length} achievements=${(b.achievements || []).length} nextSlabFrom=${b.nextSlabFrom}`);
      const fromThisOrder = (b.contributions || []).filter(
        (c) => String(c.documentNumber) === String(order.orderNumber)
      );
      console.log(`       this order's contributions: ${fromThisOrder.length}`);
    }
    console.log('');
  }
}

async function main() {
  console.log('\n🔍 Diagnose scheme progress');
  if (ORDER_NUMBER) console.log(`   order: ${ORDER_NUMBER}`);
  if (DEALER_ID) console.log(`   dealer: ${DEALER_ID}`);

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  for (const company of companies) {
    console.log(`\n━━━ Company: ${company} ━━━`);
    try {
      await diagnoseCompany(company);
    } catch (error) {
      console.error(`   ❌ ${company} failed:`, error.message);
    }
  }
  console.log('\nNothing was written — this is a read-only inspection.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Diagnose failed:', error);
    process.exit(1);
  });
