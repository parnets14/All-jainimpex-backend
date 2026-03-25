/**
 * fix-duplicate-invoices.js
 * 
 * Finds all sales orders that have more than one active invoice (draft or approved).
 * For each duplicate group:
 *   - If there is an approved invoice + draft(s) → delete the draft(s)
 *   - If there are multiple drafts → keep the newest, delete the rest
 *   - If there are multiple approved invoices → report only (manual review needed)
 * 
 * Run: node fix-duplicate-invoices.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URL);
console.log('✅ Connected to MongoDB\n');

const DealerInvoice = (await import('./models/DealerInvoice.js')).default;

// ── Step 1: Find all SOs that have more than one active invoice ──────────────
const duplicates = await DealerInvoice.aggregate([
  {
    $match: {
      salesOrder: { $ne: null },
      isDeleted: { $ne: true },
      status: { $nin: ['Cancelled', 'Rejected'] }
    }
  },
  {
    $group: {
      _id: '$salesOrder',
      count: { $sum: 1 },
      invoices: {
        $push: {
          _id: '$_id',
          invoiceNumber: '$invoiceNumber',
          status: '$status',
          isDraft: '$isDraft',
          createdAt: '$createdAt',
          totalAmount: '$totalAmount',
          dealerName: '$dealerName'
        }
      }
    }
  },
  { $match: { count: { $gt: 1 } } },
  { $sort: { count: -1 } }
]);

if (duplicates.length === 0) {
  console.log('✅ No duplicate invoices found. Database is clean.');
  await mongoose.connection.close();
  process.exit(0);
}

console.log(`⚠️  Found ${duplicates.length} sales order(s) with duplicate invoices:\n`);

let deletedCount = 0;
let manualReviewCount = 0;

for (const group of duplicates) {
  const soId = group._id;
  const invoices = group.invoices;

  const approved = invoices.filter(i => !i.isDraft && i.status !== 'Draft');
  const drafts   = invoices.filter(i =>  i.isDraft || i.status === 'Draft');

  console.log(`─────────────────────────────────────────────`);
  console.log(`Sales Order: ${soId}`);
  console.log(`  Total invoices: ${invoices.length} (${approved.length} approved, ${drafts.length} draft)`);
  invoices.forEach(inv => {
    console.log(`  • ${inv.isDraft || inv.status === 'Draft' ? 'DRAFT' : inv.invoiceNumber} | ${inv.status} | ₹${inv.totalAmount?.toLocaleString()} | ${inv.dealerName} | created: ${new Date(inv.createdAt).toLocaleString()}`);
  });

  if (approved.length >= 1 && drafts.length >= 1) {
    // Safe to delete all drafts — approved invoice is the real one
    const draftIds = drafts.map(d => d._id);
    console.log(`  🗑️  Action: Deleting ${drafts.length} draft(s) — approved invoice exists`);
    await DealerInvoice.deleteMany({ _id: { $in: draftIds } });
    deletedCount += drafts.length;
    console.log(`  ✅ Deleted draft(s): ${draftIds.join(', ')}`);

  } else if (approved.length === 0 && drafts.length > 1) {
    // Multiple drafts — keep newest, delete older ones
    const sorted = drafts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const keep   = sorted[0];
    const remove = sorted.slice(1);
    const removeIds = remove.map(d => d._id);
    console.log(`  🗑️  Action: Keeping newest draft (${keep._id}), deleting ${remove.length} older draft(s)`);
    await DealerInvoice.deleteMany({ _id: { $in: removeIds } });
    deletedCount += remove.length;
    console.log(`  ✅ Deleted: ${removeIds.join(', ')}`);

  } else if (approved.length > 1) {
    // Multiple approved invoices — cannot auto-fix, needs manual review
    console.log(`  ⚠️  MANUAL REVIEW NEEDED: ${approved.length} approved invoices for same SO`);
    manualReviewCount++;
  }
}

console.log(`\n═════════════════════════════════════════════`);
console.log(`Summary:`);
console.log(`  Duplicate groups found : ${duplicates.length}`);
console.log(`  Invoices deleted       : ${deletedCount}`);
console.log(`  Manual review needed   : ${manualReviewCount}`);
console.log(`═════════════════════════════════════════════\n`);

await mongoose.connection.close();
console.log('✅ Done. Database connection closed.');
