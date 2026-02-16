import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';

dotenv.config();

const debugCurrentPendingOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check the specific order SO-2026-0006
    console.log('🔍 Checking Order: SO-2026-0006');
    console.log('═══════════════════════════════════════════════════════════\n');

    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0006' })
      .populate('dealer', 'name')
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name')
      .lean();

    if (!order) {
      console.log('❌ Order not found!');
      process.exit(1);
    }

    console.log('📋 Order Details:');
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Dealer: ${order.dealer?.name || order.dealerName}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   isOutOfStock: ${order.isOutOfStock}`);
    console.log(`   Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    console.log();

    console.log('📦 Products in Order:');
    order.products.forEach((product, index) => {
      console.log(`\n   Product ${index + 1}:`);
      console.log(`   - Name: ${product.product?.itemName || 'Unknown'}`);
      console.log(`   - Code: ${product.product?.productCode || 'N/A'}`);
      console.log(`   - Quantity: ${product.quantity}`);
      console.log(`   - Warehouse ID: ${product.warehouse}`);
      console.log(`   - Warehouse Name: ${product.warehouseName || 'Not set'}`);
      console.log(`   - Warehouse Object: ${product.warehouse ? 'Populated' : 'Not populated'}`);
    });

    console.log('\n\n🔍 ISSUE ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check if order should appear in pending quantities
    console.log('✅ Checking Pending Quantities Criteria:');
    console.log(`   1. isOutOfStock = ${order.isOutOfStock} ${order.isOutOfStock ? '✅' : '❌ MISSING!'}`);
    console.log(`   2. status = "${order.status}" ${order.status === 'Pending' ? '✅' : '❌ Should be "Pending"!'}`);
    console.log();

    if (!order.isOutOfStock) {
      console.log('❌ PROBLEM FOUND: isOutOfStock is not set to true!');
      console.log('   This order will NOT appear in pending quantities.');
      console.log();
      console.log('💡 SOLUTION:');
      console.log('   The order needs to have isOutOfStock = true');
      console.log('   This should be set automatically when creating order with no stock.');
      console.log();
    }

    if (order.status !== 'Pending') {
      console.log(`❌ PROBLEM FOUND: Status is "${order.status}" instead of "Pending"!`);
      console.log('   This order will NOT appear in pending quantities.');
      console.log();
    }

    // Check warehouse assignment
    console.log('🏭 Warehouse Assignment Check:');
    order.products.forEach((product, index) => {
      console.log(`\n   Product ${index + 1}:`);
      if (!product.warehouse) {
        console.log('   ❌ No warehouse ID assigned!');
      } else if (product.warehouseName === 'No Stock') {
        console.log(`   ⚠️  Warehouse name is "No Stock"`);
        console.log(`   ⚠️  Warehouse ID: ${product.warehouse}`);
        console.log('   This might cause issues with pending quantity aggregation.');
      } else {
        console.log(`   ✅ Warehouse assigned: ${product.warehouseName}`);
      }
    });

    console.log('\n\n🔧 RECOMMENDED FIXES:');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (!order.isOutOfStock || order.status !== 'Pending') {
      console.log('1. Update this order to set:');
      console.log('   - isOutOfStock = true');
      console.log('   - status = "Pending"');
      console.log();
      console.log('2. Fix the Sales Order creation logic to automatically set these fields');
      console.log('   when stock is not available.');
      console.log();
    }

    // Check all pending orders
    console.log('\n📊 ALL PENDING ORDERS CHECK:');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allPendingOrders = await SalesOrder.find({
      status: 'Pending'
    }).select('orderNumber status isOutOfStock').lean();

    console.log(`Total Pending Orders: ${allPendingOrders.length}\n`);
    allPendingOrders.forEach(o => {
      console.log(`   ${o.orderNumber}: status="${o.status}", isOutOfStock=${o.isOutOfStock || false}`);
    });

    const outOfStockPending = await SalesOrder.find({
      isOutOfStock: true,
      status: 'Pending'
    }).lean();

    console.log(`\n✅ Orders that WILL show in pending quantities: ${outOfStockPending.length}`);
    console.log(`❌ Orders that WON'T show (missing isOutOfStock): ${allPendingOrders.length - outOfStockPending.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugCurrentPendingOrder();
