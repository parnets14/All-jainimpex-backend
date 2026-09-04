/**
 * Reset Transactional Data for a company — keeps master data, deletes transactions.
 *
 * KEEPS: Users, Roles, Products, Brands, Categories, Dealers (master), Suppliers,
 *        Warehouses, Regions, Routes, Bank Accounts (master), Cash Account (master),
 *        Account Master (chart of accounts), Price List, Product Price List History,
 *        Employees, Attendance, Claims, Claim Types, Dealer Types, Dealer Categories,
 *        Expense Categories, Fixed Assets (master), Discount Mappings, Opening Stock,
 *        Opening Dealer Ledger and Opening Journal Voucher postings.
 *
 * DELETES: Purchase Orders, GRNs, Supplier Invoices, Sales Orders, Dealer Invoices,
 *          Dealer Payments, Supplier Payments, Vouchers, non-opening Journal Vouchers,
 *          non-opening Dealer Ledger rows, Payment Allocations, Credit Notes, Debit Notes,
 *          Cheques, Expenses, Stock Movements (non-OPENING), TDS Entries, Financial Year Closings,
 *          Year-End Checklist, Bank Reconciliation, Audit Trail, Activity Logs,
 *          Notifications, Dealer Order Requests, Collections.
 *
 * RESETS: Dealer paidAmount/pendingAmount/openingBalanceAllocated → 0,
 *         Bank/Cash currentBalance → openingBalance.
 *
 * Run: node scripts/resetTransactions.js --company=shree-jain-impex
 * Options: --dry-run, --company=X (REQUIRED)
 */

import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find((a) => a.startsWith('--company='));
const COMPANY = companyArg ? companyArg.split('=')[1] : null;

if (!COMPANY) {
  console.error('❌ --company=<name> is required (e.g. --company=shree-jain-impex)');
  process.exit(1);
}

// Collections to drop entirely (transactional data)
const COLLECTIONS_TO_DROP = [
  'purchaseorders',
  'grns',
  'supplierinvoices',
  'salesorders',
  'dealerinvoices',
  'dealerpayments',
  'supplierpayments',
  'vouchers',
  'paymentallocations',
  'creditnotes',
  'debitnotes',
  'cheques',
  'expenses',
  'tdsentries',
  'financialyearclosings',
  'yearendchecklists',
  'bankreconciliations',
  'audittrails',
  'activitylogs',
  'notifications',
  'dealerorderrequests',
  'collections',
];

async function reset() {
  console.log(`\n🔄 Reset Transactional Data`);
  console.log(`   Company: ${COMPANY}`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '💾 LIVE — THIS WILL DELETE DATA'}\n`);

  if (!DRY_RUN) {
    console.log('   ⚠️  Starting in 3 seconds... (Ctrl+C to abort)');
    await new Promise((r) => setTimeout(r, 3000));
  }

  const db = getCompanyConnection(COMPANY);
  await db.asPromise();
  console.log(`   ✅ Connected to ${COMPANY}\n`);

  const existingCollections = (await db.db.listCollections().toArray()).map((c) => c.name);

  // 1) Drop transactional collections
  console.log('━━━ Dropping transactional collections ━━━');
  for (const col of COLLECTIONS_TO_DROP) {
    if (existingCollections.includes(col)) {
      const count = await db.db.collection(col).countDocuments();
      console.log(`   🗑️  ${col}: ${count} docs`);
      if (!DRY_RUN) await db.db.collection(col).drop();
    }
  }

  // Preserve opening postings because the retained master opening balances still
  // depend on them after transactional data is cleared.
  if (existingCollections.includes('dealerledgers')) {
    const collection = db.db.collection('dealerledgers');
    const kept = await collection.countDocuments({ transactionType: 'Opening Balance' });
    const deleted = await collection.countDocuments({ transactionType: { $ne: 'Opening Balance' } });
    console.log(`\n   📒 dealerledgers: keeping ${kept} opening row(s), deleting ${deleted} others`);
    if (!DRY_RUN) await collection.deleteMany({ transactionType: { $ne: 'Opening Balance' } });
  }
  if (existingCollections.includes('journalvouchers')) {
    const collection = db.db.collection('journalvouchers');
    const kept = await collection.countDocuments({ voucherType: 'Opening Entry' });
    const deleted = await collection.countDocuments({ voucherType: { $ne: 'Opening Entry' } });
    console.log(`   📘 journalvouchers: keeping ${kept} opening row(s), deleting ${deleted} others`);
    if (!DRY_RUN) await collection.deleteMany({ voucherType: { $ne: 'Opening Entry' } });
  }

  // 2) Delete non-OPENING stock movements (keep OPENING type so opening stock stays)
  if (existingCollections.includes('stockmovements')) {
    const totalStock = await db.db.collection('stockmovements').countDocuments();
    const openingStock = await db.db.collection('stockmovements').countDocuments({ type: 'OPENING' });
    const toDelete = totalStock - openingStock;
    console.log(`\n   📦 stockmovements: keeping ${openingStock} OPENING, deleting ${toDelete} others`);
    if (!DRY_RUN) {
      await db.db.collection('stockmovements').deleteMany({ type: { $ne: 'OPENING' } });
    }
  }

  // 3) Reset dealer payment/allocation fields
  if (existingCollections.includes('dealers')) {
    const dealerCount = await db.db.collection('dealers').countDocuments();
    console.log(`\n   👤 Resetting ${dealerCount} dealer(s): paidAmount→0, pendingAmount→0, openingBalanceAllocated→0`);
    if (!DRY_RUN) {
      await db.db.collection('dealers').updateMany({}, {
        $set: { paidAmount: 0, pendingAmount: 0, openingBalanceAllocated: 0 },
      });
    }
  }

  // 4) Reset bank accounts: currentBalance → openingBalance
  if (existingCollections.includes('bankaccounts')) {
    const banks = await db.db.collection('bankaccounts').find({}).toArray();
    console.log(`\n   🏦 Resetting ${banks.length} bank account(s): currentBalance → openingBalance`);
    if (!DRY_RUN) {
      for (const bank of banks) {
        await db.db.collection('bankaccounts').updateOne(
          { _id: bank._id },
          { $set: { currentBalance: bank.openingBalance || 0 } }
        );
      }
    }
  }

  // 5) Reset cash account: currentBalance → openingBalance
  if (existingCollections.includes('cashaccounts')) {
    const cash = await db.db.collection('cashaccounts').findOne({});
    if (cash) {
      console.log(`\n   💵 Resetting cash account: currentBalance ₹${cash.currentBalance} → ₹${cash.openingBalance || 0}`);
      if (!DRY_RUN) {
        await db.db.collection('cashaccounts').updateOne(
          { _id: cash._id },
          { $set: { currentBalance: cash.openingBalance || 0 } }
        );
      }
    }
  }

  console.log(`\n━━━ DONE ━━━`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (nothing changed)' : '💾 LIVE — reset complete'}`);
  if (DRY_RUN) console.log(`   Run without --dry-run to apply.`);
  console.log('');
}

reset().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
