/**
 * Fix overpaid invoices: cap paidAmount to totalAmount
 *
 * Root cause: the resyncInvoiceTotals migration fixed invoice totals downward
 * (removed double-GST), but didn't adjust paidAmount. Since no DealerPayment
 * records are linked to these invoices (allocations = 0), the paidAmount was
 * directly stamped by old code and is safe to cap.
 *
 * Run: node scripts/fixOverpaidInvoices.js
 * Options: --dry-run, --company=X
 */

import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find((a) => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

async function fix() {
  console.log(`\n🔧 Fix Overpaid Invoices`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '💾 LIVE'}\n`);

  const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();
  let totalFixed = 0;

  for (const company of companies) {
    console.log(`━━━ ${company} ━━━`);
    const db = getCompanyConnection(company);
    await db.asPromise();
    const DealerInvoice = db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema);

    const overpaid = await DealerInvoice.find({
      isDeleted: { $ne: true },
      $expr: { $gt: ['$paidAmount', { $add: ['$totalAmount', 0.01] }] },
    }).select('invoiceNumber totalAmount paidAmount pendingAmount paymentStatus');

    if (overpaid.length === 0) {
      console.log('   ✨ No overpaid invoices\n');
      continue;
    }

    for (const inv of overpaid) {
      const oldPaid = inv.paidAmount;
      console.log(`   ${inv.invoiceNumber}: total=${inv.totalAmount} paid=${oldPaid} → capping to ${inv.totalAmount}`);
      if (!DRY_RUN) {
        await DealerInvoice.updateOne(
          { _id: inv._id },
          { $set: { paidAmount: inv.totalAmount, pendingAmount: 0, paymentStatus: 'Paid' } }
        );
      }
      totalFixed++;
    }
    console.log('');
  }

  console.log(`━━━ SUMMARY ━━━`);
  console.log(`   Fixed: ${totalFixed}`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '💾 LIVE'}`);
  if (DRY_RUN && totalFixed > 0) console.log(`   ⚠️  Run without --dry-run to apply`);
  console.log('\n✅ Done!\n');
}

fix().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
