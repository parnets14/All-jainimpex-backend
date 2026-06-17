/**
 * Migration Script: Fix accountGroup values on AccountMaster and JournalVoucher entries
 *
 * Problem: Two seeding mechanisms (accountMasterController vs seedSystemAccounts)
 * assigned different accountGroup values to the same system accounts. Depending on
 * which ran first, accounts and their JV entries could have the wrong group:
 *
 *   AccountName         WRONG group          CORRECT group
 *   ─────────────────── ──────────────────── ─────────────────
 *   Sundry Debtors      Current Assets       Sundry Debtors
 *   Sundry Creditors    Current Liabilities  Sundry Creditors
 *   GST Payable         Duties & Taxes       GST Payable
 *   GST Input Credit    Current Assets       GST Input Credit
 *
 * This script:
 *   1. Fixes the AccountMaster documents
 *   2. Fixes all JournalVoucher entries that reference these accounts (by accountName)
 *
 * Run: node scripts/fixAccountGroups.js
 * Options:
 *   --dry-run     Show what would change without saving
 *   --company=X   Only process specific company
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { journalVoucherSchema } from '../models/JournalVoucher.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

// The canonical mapping: accountName → correct accountGroup
const FIXES = [
  { accountName: 'Sundry Debtors',   correctGroup: 'Sundry Debtors',   wrongGroups: ['Current Assets'] },
  { accountName: 'Sundry Creditors', correctGroup: 'Sundry Creditors', wrongGroups: ['Current Liabilities'] },
  { accountName: 'GST Payable',      correctGroup: 'GST Payable',      wrongGroups: ['Duties & Taxes'] },
  { accountName: 'GST Input Credit', correctGroup: 'GST Input Credit', wrongGroups: ['Current Assets'] },
];

async function fixAccountGroups() {
  try {
    console.log(`\n🔧 Fix Account Groups Migration`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will update DB)'}`);

    const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();

    let totalAccountsFixed = 0;
    let totalJVEntriesFixed = 0;

    for (const company of companies) {
      console.log(`\n━━━ Processing company: ${company} ━━━`);

      const db = getCompanyConnection(company);
      await db.asPromise();

      const AccountMaster = db.models.AccountMaster || db.model('AccountMaster', accountMasterSchema);
      const JournalVoucher = db.models.JournalVoucher || db.model('JournalVoucher', journalVoucherSchema);

      for (const fix of FIXES) {
        // 1) Fix AccountMaster
        const account = await AccountMaster.findOne({
          accountName: fix.accountName,
          accountGroup: { $in: fix.wrongGroups },
        });

        if (account) {
          console.log(`   📌 AccountMaster: "${fix.accountName}" has group "${account.accountGroup}" → should be "${fix.correctGroup}"`);
          if (!DRY_RUN) {
            account.accountGroup = fix.correctGroup;
            await account.save();
            console.log(`      ✅ Fixed`);
          }
          totalAccountsFixed++;
        }

        // 2) Fix JournalVoucher entries that have the wrong group for this accountName
        const jvCount = await JournalVoucher.countDocuments({
          'entries.accountName': fix.accountName,
          'entries.accountGroup': { $in: fix.wrongGroups },
        });

        if (jvCount > 0) {
          console.log(`   📌 JournalVoucher entries: ${jvCount} JV(s) have "${fix.accountName}" with wrong group`);

          if (!DRY_RUN) {
            // Use bulkWrite with arrayFilters to update nested entries
            const result = await JournalVoucher.updateMany(
              {
                'entries.accountName': fix.accountName,
                'entries.accountGroup': { $in: fix.wrongGroups },
              },
              {
                $set: { 'entries.$[elem].accountGroup': fix.correctGroup },
              },
              {
                arrayFilters: [
                  { 'elem.accountName': fix.accountName, 'elem.accountGroup': { $in: fix.wrongGroups } },
                ],
              }
            );
            console.log(`      ✅ Fixed ${result.modifiedCount} JV document(s)`);
          }
          totalJVEntriesFixed += jvCount;
        }
      }
    }

    console.log(`\n\n━━━ MIGRATION SUMMARY ━━━`);
    console.log(`   AccountMaster documents fixed: ${totalAccountsFixed}`);
    console.log(`   JournalVoucher documents with fixed entries: ${totalJVEntriesFixed}`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes made)' : '💾 LIVE (changes saved)'}`);
    if (DRY_RUN && (totalAccountsFixed > 0 || totalJVEntriesFixed > 0)) {
      console.log(`\n   ⚠️  Run without --dry-run to apply fixes`);
    }
    if (totalAccountsFixed === 0 && totalJVEntriesFixed === 0) {
      console.log(`\n   ✨ Nothing to fix — all account groups are already correct!`);
    }
    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  }
}

export { fixAccountGroups };

if (process.argv[1]?.includes('fixAccountGroups')) {
  setTimeout(() => fixAccountGroups().then(() => process.exit(0)).catch(() => process.exit(1)), 3000);
}
