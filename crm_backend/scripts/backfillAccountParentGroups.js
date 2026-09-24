/**
 * Migration Script: backfill AccountMaster.parentGroup
 *
 * Adds the Tally-style primary group (Assets / Liabilities / Income / Expenses) to
 * every ledger account, derived from its existing `accountGroup` via
 * config/accountGroups.js. The new field is what lets statements group consistently
 * instead of each report deciding for itself.
 *
 * Safe to re-run: it only touches documents whose parentGroup does not already
 * match the mapping.
 *
 * Run: node scripts/backfillAccountParentGroups.js
 * Options:
 *   --dry-run     Show what would change without saving
 *   --company=X   Only process a specific company
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { accountMasterSchema } from '../models/AccountMaster.js';
import { PARENT_GROUP_MAP, parentGroupFor } from '../config/accountGroups.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

async function backfill() {
  console.log('\n🔧 Backfill AccountMaster.parentGroup');
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will update DB)'}`);

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  let grandTotal = 0;
  const unclassified = new Set();

  for (const company of companies) {
    console.log(`\n━━━ Company: ${company} ━━━`);

    const db = getCompanyConnection(company);
    await db.asPromise();
    const AccountMaster =
      db.models.AccountMaster || db.model('AccountMaster', accountMasterSchema);

    // Report any ledger group that has no mapping — better to surface it than to
    // leave accounts silently unclassified.
    const distinctGroups = await AccountMaster.distinct('accountGroup');
    for (const g of distinctGroups) {
      if (!Object.prototype.hasOwnProperty.call(PARENT_GROUP_MAP, g)) unclassified.add(g);
    }

    let companyTotal = 0;

    for (const [accountGroup, parentGroup] of Object.entries(PARENT_GROUP_MAP)) {
      const filter = parentGroup === null
        ? { accountGroup, parentGroup: { $ne: null } }
        : { accountGroup, parentGroup: { $ne: parentGroup } };

      const count = await AccountMaster.countDocuments(filter);
      if (count === 0) continue;

      if (!DRY_RUN) {
        await AccountMaster.updateMany(filter, { $set: { parentGroup } });
      }
      companyTotal += count;
      console.log(`   ${accountGroup} → ${parentGroup ?? 'null'}: ${count} account(s)`);
    }

    console.log(`   ${company}: ${companyTotal} account(s) ${DRY_RUN ? 'would be' : ''} updated`);
    grandTotal += companyTotal;
  }

  console.log(`\n✅ Done. ${grandTotal} account(s) ${DRY_RUN ? 'would be' : ''} updated across ${companies.length} company(ies).`);

  if (unclassified.size > 0) {
    console.log('\n⚠️  Ledger groups with no parent mapping (left unclassified):');
    for (const g of unclassified) console.log(`   - ${g}`);
    console.log('   Add them to PARENT_GROUP_MAP in config/accountGroups.js and re-run.');
  }
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Backfill failed:', err);
    process.exit(1);
  });
