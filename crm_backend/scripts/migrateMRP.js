/**
 * Migration Script: Fix existing products in jain-impex database
 * 
 * Problem: Old unitPrice was entered as MRP (GST inclusive)
 * Fix: Set mrp = old unitPrice, recalculate unitPrice = mrp / (1 + gst/100)
 * 
 * Run: node --experimental-modules scripts/migrateMRP.js
 * Or add as API endpoint and call once
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getCompanyConnection } from '../config/multiDatabase.js';
import { productSchema } from '../models/Product.js';

dotenv.config();

const COMPANY = 'jain-impex'; // Only fix jain-impex database

async function migrate() {
  try {
    console.log(`\n🔄 Starting MRP migration for "${COMPANY}" database...\n`);

    // Connect to the company database
    const db = getCompanyConnection(COMPANY);
    const Product = db.models.Product || db.model('Product', productSchema);

    // Find all products that don't have mrp set yet
    const products = await Product.find({ mrp: { $in: [null, undefined, 0] } }).lean();

    console.log(`📦 Found ${products.length} products without MRP\n`);

    if (products.length === 0) {
      console.log('✅ No products to migrate. All products already have MRP set.');
      return;
    }

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const product of products) {
      try {
        const oldUnitPrice = product.unitPrice;
        const gst = product.gst || 0;

        if (!oldUnitPrice || oldUnitPrice <= 0) {
          skipped++;
          continue;
        }

        // Old unitPrice IS the MRP (GST inclusive)
        const mrp = oldUnitPrice;
        
        // Calculate real unit price (GST exclusive)
        const newUnitPrice = gst > 0 
          ? parseFloat((mrp / (1 + gst / 100)).toFixed(2))
          : mrp;

        // Update directly in DB (skip pre-save hooks to avoid re-calculation)
        await Product.updateOne(
          { _id: product._id },
          { 
            $set: { 
              mrp: mrp,
              unitPrice: newUnitPrice,
              totalAmount: mrp  // totalAmount = MRP
            } 
          }
        );

        updated++;

        if (updated <= 5) {
          console.log(`  ✅ ${product.productCode || product.itemName}: MRP=₹${mrp}, GST=${gst}%, Unit Price=₹${newUnitPrice}`);
        }
      } catch (err) {
        errors.push({ id: product._id, name: product.itemName, error: err.message });
      }
    }

    if (updated > 5) {
      console.log(`  ... and ${updated - 5} more`);
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Skipped (no price): ${skipped}`);
    console.log(`  ❌ Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    }

    console.log('\n✅ Migration complete!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
}

// Export for use as API endpoint
export { migrate as migrateMRP };

// Run directly if called as script
if (process.argv[1]?.includes('migrateMRP')) {
  // Need to wait for DB connections
  setTimeout(() => migrate().then(() => process.exit(0)), 3000);
}
