/**
 * Migration Script: Backfill journal entries for standalone cash/bank vouchers
 *
 * The Voucher module (Receipt / Payment / Contra) historically updated only the
 * cash/bank balance documents and the dealer ledger — it never posted journal
 * vouchers. As a result those cash movements were invisible to the trial balance
 * and balance sheet (which are built from journal vouchers).
 *
 * This script posts the missing journal entries using the same safe rules as the
 * live code (services/accountingService.js -> createVoucherEntry):
 *   - Contra (cash <-> bank): Dr destination / Cr source
 *   - Receipt/Payment for Dealer or Supplier: SKIPPED (owned by payment modules)
 *   - Other / Internal / Family-Friends Receipt: Dr Cash/Bank / Cr Suspense
 *   - Other / Internal / Family-Friends Payment: Dr Suspense / Cr Cash/Bank
 *
 * It is idempotent — a voucher that already has a linked journal entry is skipped.
 *
 * Run: node scripts/backfillVoucherJournals.js
 * Options:
 *   --dry-run     Show what would change without saving
 *   --company=X   Only process a specific company (jain-impex, ridhi, shree-jain-impex)
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { voucherSchema } from '../models/Voucher.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { createVoucherEntry } from '../services/accountingService.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

async function backfill() {
  try {
    console.log(`\n🔄 Backfill Voucher Journal Entries`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will update DB)'}`);

    const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();

    let totalProcessed = 0;
    let totalPosted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const company of companies) {
      console.log(`\n━━━ Processing company: ${company} ━━━`);

      const db = getCompanyConnection(company);
      await db.asPromise();

      // Register models on the connection
      db.models.Voucher || db.model('Voucher', voucherSchema);
      db.models.JournalVoucher || db.model('JournalVoucher', journalVoucherSchema);
      db.models.AccountMaster || db.model('AccountMaster', accountMasterSchema);
      const Voucher = db.models.Voucher;

      const vouchers = await Voucher.find({
        status: 'Posted',
        voucherType: { $in: ['Receipt', 'Payment', 'Contra'] },
      }).sort({ voucherDate: 1 }).lean();

      console.log(`   📋 Found ${vouchers.length} posted Receipt/Payment/Contra vouchers`);

      for (const v of vouchers) {
        totalProcessed++;
        try {
          if (DRY_RUN) {
            const willSkip = ['Receipt', 'Payment'].includes(v.voucherType) && ['Dealer', 'Supplier'].includes(v.partyType);
            if (willSkip) { totalSkipped++; continue; }
            // Check if already journalized
            const JV = db.models.JournalVoucher;
            const existing = await JV.findOne({ referenceId: v._id, referenceNumber: v.voucherNumber });
            if (existing) { totalSkipped++; continue; }
            totalPosted++;
            console.log(`   + Would post: ${v.voucherType} ${v.voucherNumber} (${v.partyType}) ₹${v.totalAmount}`);
          } else {
            const before = await db.models.JournalVoucher.findOne({ referenceId: v._id, referenceNumber: v.voucherNumber });
            const jv = await createVoucherEntry(v, db, v.createdBy);
            if (jv && !before) {
              totalPosted++;
              console.log(`   ✅ Posted ${jv.voucherNumber} for ${v.voucherType} ${v.voucherNumber}`);
            } else {
              totalSkipped++;
            }
          }
        } catch (err) {
          totalErrors++;
          console.error(`   ❌ Error on voucher ${v.voucherNumber || v._id}: ${err.message}`);
        }
      }
    }

    console.log(`\n\n━━━ BACKFILL SUMMARY ━━━`);
    console.log(`   Vouchers processed: ${totalProcessed}`);
    console.log(`   Journal entries posted: ${totalPosted}`);
    console.log(`   Skipped (dealer/supplier or already posted): ${totalSkipped}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes made)' : '💾 LIVE (changes saved)'}`);
    if (DRY_RUN && totalPosted > 0) console.log(`\n   ⚠️  Run without --dry-run to post these entries`);
    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
  }
}

export { backfill };

if (process.argv[1]?.includes('backfillVoucherJournals')) {
  setTimeout(() => backfill().then(() => process.exit(0)).catch(() => process.exit(1)), 3000);
}
