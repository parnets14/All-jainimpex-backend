import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

const fixAllConfirmedOrders = async () => {
  try {
    const mongoUri = process.env.MONGO_URL;
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find all confirmed orders that are NOT out-of-stock
    console.log('🔍 Finding all Confirmed orders...');
    const confirmedOrders = await SalesOrder.find({
      status: 'Confirmed',
      isOutOfStock: { $ne: true }
    }).sort({ createdAt: -1 });

    console.log(`📦 Found ${confirmedOrders.length} confirmed orders\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const order of confirmedOrders) {
      console.log(`\n📋 Checking order: ${order.orderNumber}`);
      
      // Check if StockMovement records already exist for this order
      const existingMovements = await StockMovement.find({
        referenceNo: order.orderNumber,
        referenceType: 'SALE'
      });

      if (existingMovements.length > 0) {
        console.log(`   ✅ Already has ${existingMovements.length} movements - SKIP`);
        skippedCount++;
        continue;
      }

      console.log(`   ⚠️  No movements found - FIXING...`);

      try {
        let createdMovements = 0;
        
        for (const product of order.products) {
          if (!product.warehouse) {
            console.log(`   ⚠️  Product ${product.productName} has no warehouse - skip`);
            continue;
          }

          // Get current balance
          const latestMovement = await StockMovement.findOne({
            productId: product.product,
            warehouseId: product.warehouse
          }).sort({ date: -1, createdAt: -1 });

          const currentBalance = latestMovement ? latestMovement.balance : 0;
          const newBalance = currentBalance - product.quantity;

          const movement = new StockMovement({
            productId: product.product,
            warehouseId: product.warehouse,
            type: 'OUT',
            quantity: product.quantity,
            balance: newBalance,
            referenceNo: order.orderNumber,
            referenceType: 'SALE',
            date: order.createdAt || new Date(),
            remarks: `Order ${order.orderNumber} - Stock Blocked (Migration Fix)`,
            createdBy: order.createdBy
          });

          await movement.save();
          createdMovements++;
          
          console.log(`   ✅ Created movement: ${product.productName} (${product.quantity} units)`);
        }

        if (createdMovements > 0) {
          console.log(`   ✅ FIXED - Created ${createdMovements} movements`);
          fixedCount++;
        } else {
          console.log(`   ⚠️  No movements created (no products with warehouse)`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`   ❌ ERROR fixing order: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n\n═══════════════════════════════════════');
    console.log('📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total Confirmed Orders: ${confirmedOrders.length}`);
    console.log(`✅ Fixed: ${fixedCount}`);
    console.log(`⏭️  Skipped (already had movements): ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('═══════════════════════════════════════\n');

    if (fixedCount > 0) {
      console.log('✅ Migration complete!');
      console.log('\n📝 Next steps:');
      console.log('1. Refresh the Stock Management page');
      console.log('2. Verify blocked quantities now show correctly');
      console.log('3. Test creating a new order and confirming it');
    } else {
      console.log('ℹ️  No orders needed fixing.');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
  } catch (error) {
    console.error('\n❌ Fatal Error:', error);
    process.exit(1);
  }
};

fixAllConfirmedOrders();
