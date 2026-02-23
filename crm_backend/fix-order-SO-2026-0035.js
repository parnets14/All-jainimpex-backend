import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

const fixOrder = async () => {
  try {
    const mongoUri = process.env.MONGO_URL;
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const orderNumber = 'SO-2026-0035';
    console.log(`\n🔍 Finding order: ${orderNumber}`);

    // Find the order
    const order = await SalesOrder.findOne({ orderNumber });
    
    if (!order) {
      console.log('❌ Order not found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`✅ Found order: ${orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Products: ${order.products.length}`);
    console.log(`   Is Out of Stock: ${order.isOutOfStock}`);

    if (order.status !== 'Confirmed') {
      console.log(`\n⚠️  Order status is "${order.status}", not "Confirmed"`);
      console.log('Cannot create StockMovement records for non-confirmed orders.');
      await mongoose.disconnect();
      return;
    }

    if (order.isOutOfStock) {
      console.log('\n⚠️  This is an out-of-stock order. No stock movements should be created.');
      await mongoose.disconnect();
      return;
    }

    console.log('\n📦 Creating StockMovement records...');

    for (const product of order.products) {
      if (!product.warehouse) {
        console.log(`⚠️  Product ${product.productName} has no warehouse assigned, skipping...`);
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
        referenceNo: orderNumber,
        referenceType: 'SALE',
        date: order.createdAt || new Date(),
        remarks: `Order ${orderNumber} - Stock Blocked (Manual Fix)`,
        createdBy: order.createdBy
      });

      await movement.save();

      console.log(`✅ Created movement for ${product.productName}:`);
      console.log(`   Product ID: ${product.product}`);
      console.log(`   Warehouse ID: ${product.warehouse}`);
      console.log(`   Quantity: ${product.quantity}`);
      console.log(`   Balance: ${currentBalance} → ${newBalance}`);
    }

    console.log('\n✅ All StockMovement records created successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Refresh the Stock Management page');
    console.log('2. Verify blocked quantity now shows correctly');

    await mongoose.disconnect();
    console.log('\n✅ Fix complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixOrder();
