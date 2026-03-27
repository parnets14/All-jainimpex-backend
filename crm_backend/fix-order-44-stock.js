import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const fixOrder44Stock = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find order SO-2026-0044
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0044' });

    if (!order) {
      console.log('❌ Order SO-2026-0044 not found');
      process.exit(1);
    }

    console.log(`\n📋 Order: ${order.orderNumber}`);
    console.log(`Status: ${order.status}`);
    console.log(`Products in order: ${order.products?.length || 0}`);

    // Find all OUT movements for this order that haven't been restored
    const outMovements = await StockMovement.find({
      referenceNo: order.orderNumber,
      type: 'OUT'
    }).populate('productId', 'itemName').populate('warehouseId', 'name');

    console.log(`\n📊 Found ${outMovements.length} OUT movements to restore`);

    let restoredCount = 0;

    for (const outMovement of outMovements) {
      // Check if already restored
      const existingInMovement = await StockMovement.findOne({
        referenceNo: order.orderNumber,
        type: 'IN',
        productId: outMovement.productId,
        warehouseId: outMovement.warehouseId
      });

      if (existingInMovement) {
        console.log(`⏭️  Already restored: ${outMovement.productId?.itemName} in ${outMovement.warehouseId?.name}`);
        continue;
      }

      // Get current balance
      const latestMovement = await StockMovement.findOne({
        productId: outMovement.productId,
        warehouseId: outMovement.warehouseId
      }).sort({ date: -1, createdAt: -1 });

      const currentBalance = latestMovement ? latestMovement.balance : 0;
      const newBalance = currentBalance + outMovement.quantity;

      // Create IN movement to restore stock
      const unblockMovement = new StockMovement({
        productId: outMovement.productId,
        warehouseId: outMovement.warehouseId,
        type: 'IN',
        quantity: outMovement.quantity,
        balance: newBalance,
        referenceNo: order.orderNumber,
        referenceType: 'SALE',
        date: new Date(),
        remarks: `Order ${order.orderNumber} - Stock Unblocked (Manual Fix - Order Cancelled)`,
        createdBy: null // System fix
      });

      await unblockMovement.save();
      
      console.log(`✅ Restored ${outMovement.quantity} units of ${outMovement.productId?.itemName} in ${outMovement.warehouseId?.name}`);
      console.log(`   Balance: ${currentBalance} -> ${newBalance}`);
      
      restoredCount++;
    }

    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total OUT movements: ${outMovements.length}`);
    console.log(`   Restored: ${restoredCount}`);
    console.log(`   Already restored: ${outMovements.length - restoredCount}`);

    if (restoredCount > 0) {
      console.log('\n✅ Stock successfully restored for order SO-2026-0044!');
    } else {
      console.log('\n⚠️  No stock needed to be restored (already done)');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixOrder44Stock();
