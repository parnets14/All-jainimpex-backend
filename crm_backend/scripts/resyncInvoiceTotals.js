/**
 * Migration Script: Resync all dealer invoice totals
 * 
 * Problem: Old invoices stored incorrect subtotal/totalAmount because:
 *   - Backend used unitPrice (base price) instead of MRP for subtotal
 *   - Formula was subtotal - discount + gst (wrong for MRP-inclusive pricing)
 *   - Some invoices had mrp = unitPrice * 1.18 (double GST)
 * 
 * Fix: Re-save each invoice so the pre-save hook recalculates:
 *   - subtotal = MRP × Qty (GST inclusive)
 *   - totalDiscount = sequential discount amounts
 *   - totalGst = reverse-calculated from final amounts
 *   - totalAmount = sum of item totalPrices (MRP after sequential discounts)
 * 
 * Run: node scripts/resyncInvoiceTotals.js
 * 
 * Options:
 *   --dry-run     Show what would change without saving
 *   --company=X   Only process specific company (jain-impex, ridhi, shree-jain-impex)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection, getValidCompanies } from '../config/multiDatabase.js';
import { dealerInvoiceSchema } from '../models/DealerInvoice.js';
import { productSchema } from '../models/Product.js';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const companyArg = args.find(a => a.startsWith('--company='));
const SPECIFIC_COMPANY = companyArg ? companyArg.split('=')[1] : null;

async function resyncInvoices() {
  try {
    console.log(`\n🔄 Resync Invoice Totals Migration`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '💾 LIVE (will update DB)'}`);
    console.log('');

    const companies = SPECIFIC_COMPANY ? [SPECIFIC_COMPANY] : getValidCompanies();

    let totalProcessed = 0;
    let totalFixed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const company of companies) {
      console.log(`\n━━━ Processing company: ${company} ━━━`);

      const db = getCompanyConnection(company);
      await db.asPromise();

      const DealerInvoice = db.models.DealerInvoice || db.model('DealerInvoice', dealerInvoiceSchema);
      const Product = db.models.Product || db.model('Product', productSchema);

      // Get all invoices (including drafts, excluding deleted)
      const invoices = await DealerInvoice.find({ isDeleted: { $ne: true } }).lean();
      console.log(`   📋 Found ${invoices.length} invoices`);

      for (const invoice of invoices) {
        totalProcessed++;

        try {
          // Recalculate what the correct values should be
          let newSubtotal = 0;
          let newTotalDiscount = 0;
          let newTotalGst = 0;
          let newTotalAmount = 0;
          let itemFixes = [];

          for (const item of invoice.items) {
            // Determine MRP per unit — ALWAYS look up from Product DB to avoid using
            // incorrectly stored item.mrp (which may have double-GST from old bug)
            let mrpPerUnit = null;

            // Look up the actual MRP from the Product collection (source of truth)
            const product = await Product.findById(item.product).lean();
            if (product && product.mrp && product.mrp > 0) {
              mrpPerUnit = product.mrp; // Product.mrp is the correct GST-inclusive price
            } else if (product && product.unitPrice) {
              // Product.unitPrice is base price (excl GST), calculate MRP
              mrpPerUnit = product.unitPrice * (1 + (item.gst || product.gst || 0) / 100);
            }

            // Fallback: if product not found in DB, use item.unitPrice from invoice
            // (In SalesOrder context, item.unitPrice IS MRP after migration)
            if (!mrpPerUnit) {
              mrpPerUnit = item.unitPrice || 0;
            }

            const grossAmount = item.quantity * mrpPerUnit;

            // Apply discounts SEQUENTIALLY
            let currentAmount = grossAmount;
            let totalDiscountAmount = 0;

            // Get discount details from appliedDiscounts
            const appliedDiscount = item.appliedDiscounts?.[0];
            const directDiscountPct = (appliedDiscount?.discountType === 'both' || appliedDiscount?.discountType === 'direct')
              ? (appliedDiscount?.directDiscountPercentage || 0)
              : 0;

            // 1. Apply direct discount
            if (directDiscountPct > 0) {
              const directAmt = currentAmount * (directDiscountPct / 100);
              currentAmount -= directAmt;
              totalDiscountAmount += directAmt;
            }

            // 2. Apply level discounts sequentially
            const selectedLevels = item.selectedDiscountLevels || [];
            const manualLevels = item.manualDiscountLevels instanceof Map 
              ? Object.fromEntries(item.manualDiscountLevels) 
              : (item.manualDiscountLevels || {});
            const allLevels = appliedDiscount?.levels || [];

            if (selectedLevels.length > 0) {
              for (const levelName of selectedLevels) {
                const levelDef = allLevels.find(l => l.levelName === levelName);
                const pct = manualLevels[levelName] !== undefined 
                  ? Number(manualLevels[levelName]) 
                  : (levelDef?.discountPercentage || 0);
                if (pct > 0) {
                  const levelAmt = currentAmount * (pct / 100);
                  currentAmount -= levelAmt;
                  totalDiscountAmount += levelAmt;
                }
              }
            }

            // 3. Apply dealer extra discount
            const dealerExtraDiscount = item.dealerExtraDiscount || 0;
            if (dealerExtraDiscount > 0) {
              const extraAmt = currentAmount * (dealerExtraDiscount / 100);
              currentAmount -= extraAmt;
              totalDiscountAmount += extraAmt;
            }

            const itemTotal = parseFloat(currentAmount.toFixed(2));
            const itemDiscount = parseFloat(totalDiscountAmount.toFixed(2));
            const gstRate = item.gst || 0;
            const itemGst = gstRate > 0
              ? parseFloat((itemTotal - itemTotal / (1 + gstRate / 100)).toFixed(2))
              : 0;

            newSubtotal += grossAmount;
            newTotalDiscount += itemDiscount;
            newTotalGst += itemGst;
            newTotalAmount += itemTotal;

            // Check if item needs fixing
            if (Math.abs((item.totalPrice || 0) - itemTotal) > 0.5 ||
                Math.abs((item.discountAmount || 0) - itemDiscount) > 0.5) {
              itemFixes.push({
                productName: item.productName,
                oldTotal: item.totalPrice,
                newTotal: itemTotal,
                oldDiscount: item.discountAmount,
                newDiscount: itemDiscount,
                mrpUsed: mrpPerUnit
              });
            }
          }

          // Round totals
          newSubtotal = parseFloat(newSubtotal.toFixed(2));
          newTotalDiscount = parseFloat(newTotalDiscount.toFixed(2));
          newTotalGst = parseFloat(newTotalGst.toFixed(2));
          newTotalAmount = parseFloat(newTotalAmount.toFixed(2));

          // Check if invoice totals need updating
          const subtotalDiff = Math.abs((invoice.subtotal || 0) - newSubtotal);
          const discountDiff = Math.abs((invoice.totalDiscount || 0) - newTotalDiscount);
          const totalDiff = Math.abs((invoice.totalAmount || 0) - newTotalAmount);

          if (subtotalDiff > 0.5 || discountDiff > 0.5 || totalDiff > 0.5) {
            totalFixed++;

            console.log(`\n   🔧 ${invoice.invoiceNumber || 'DRAFT-' + invoice._id.toString().slice(-6)} (${invoice.status})`);
            console.log(`      Subtotal:  ₹${invoice.subtotal?.toFixed(2)} → ₹${newSubtotal.toFixed(2)} (diff: ${subtotalDiff.toFixed(2)})`);
            console.log(`      Discount:  ₹${invoice.totalDiscount?.toFixed(2)} → ₹${newTotalDiscount.toFixed(2)} (diff: ${discountDiff.toFixed(2)})`);
            console.log(`      GST:       ₹${invoice.totalGst?.toFixed(2)} → ₹${newTotalGst.toFixed(2)}`);
            console.log(`      Total:     ₹${invoice.totalAmount?.toFixed(2)} → ₹${newTotalAmount.toFixed(2)} (diff: ${totalDiff.toFixed(2)})`);

            if (itemFixes.length > 0) {
              for (const fix of itemFixes.slice(0, 3)) {
                console.log(`      Item "${fix.productName}": total ₹${fix.oldTotal?.toFixed(2)} → ₹${fix.newTotal.toFixed(2)} (MRP: ₹${fix.mrpUsed?.toFixed(2)})`);
              }
              if (itemFixes.length > 3) console.log(`      ... and ${itemFixes.length - 3} more items`);
            }

            if (!DRY_RUN) {
              // Re-save the invoice — the pre-save hook will recalculate everything
              const liveInvoice = await DealerInvoice.findById(invoice._id);
              if (liveInvoice) {
                // Fix mrp on each item using the Product collection (source of truth)
                for (const item of liveInvoice.items) {
                  const product = await Product.findById(item.product).lean();
                  if (product && product.mrp && product.mrp > 0) {
                    item.mrp = product.mrp;
                  } else if (product && product.unitPrice) {
                    item.mrp = product.unitPrice * (1 + (item.gst || product.gst || 0) / 100);
                  }
                }
                await liveInvoice.save();
                console.log(`      ✅ Saved`);
              }
            }
          } else {
            totalSkipped++;
          }
        } catch (err) {
          totalErrors++;
          console.error(`   ❌ Error processing ${invoice.invoiceNumber || invoice._id}: ${err.message}`);
        }
      }
    }

    console.log(`\n\n━━━ MIGRATION SUMMARY ━━━`);
    console.log(`   Total invoices processed: ${totalProcessed}`);
    console.log(`   Fixed:   ${totalFixed}`);
    console.log(`   Skipped (already correct): ${totalSkipped}`);
    console.log(`   Errors:  ${totalErrors}`);
    console.log(`   Mode:    ${DRY_RUN ? '🔍 DRY RUN (no changes made)' : '💾 LIVE (changes saved)'}`);
    
    if (DRY_RUN && totalFixed > 0) {
      console.log(`\n   ⚠️  Run without --dry-run to apply fixes`);
    }

    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  }
}

// Export for use as API endpoint
export { resyncInvoices };

// Run directly if called as script
if (process.argv[1]?.includes('resyncInvoiceTotals')) {
  setTimeout(() => resyncInvoices().then(() => process.exit(0)).catch(() => process.exit(1)), 3000);
}
