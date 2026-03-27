/**
 * CHECK ORDER SO-2026-0035
 * Check why stock wasn't restored when this order was cancelled
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';

async function checkOrder() {
  try {
    console.log('🔍 Checking order SO-2026-0035...\n');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Find the order
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0035' }).lean();
    
    if (!order) {
      console.log('❌ Order not found');
      return;
    }
    
    console.log('📄 ORDER DETAILS:');
    console.log('='.repeat(80));
    console.log(`Order Number: ${order.orderNumber}`);
    console.log(`Status: ${order.status}`);
    console.log(`Dealer: ${order.dealerName}`);
    console.log(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    console.log(`Total Amount: ₹${order.totalAmount}`);
    console.log(`Is Out of Stock: ${order.isOutOfStock || false}`);
    console.log(`\nProducts (${order.products?.length || 0}):`);
    if (order.products && order.products.length > 0) {
      order.products.forEach((prod, idx) => {
        console.log(`  ${idx + 1}. ${prod.productName || 'Unknown'}`);
        console.log(`     Product ID: ${prod.product}`);
        console.log(`     Quantity: ${prod.quantity}`);
        console.log(`     Warehouse: ${prod.warehouseName || prod.warehouse || 'Not assigned'}`);
        console.log(`     Warehouse ID: ${prod.warehouse || 'N/A'}`);
      });
    } else {
      console.log('  No products found');
    }
    console.log(`\nCreated: ${new Date(order.createdAt).toLocaleString()}`);
    console.log(`Updated: ${new Date(order.updatedAt).toLocaleString()}`);
    console.log(`ID: ${order._id}`);
    console.log('='.repeat(80));
    
    // Check stock movements for this order
    const movements = await StockMovement.find({ 
      referenceNo: order.orderNumber 
    }).sort({ date: 1, createdAt: 1 }).lean();
    
    console.log(`\n📊 STOCK MOVEMENTS FOR THIS ORDER: ${movements.length}\n`);
    
    if (movements.length > 0) {
      movements.forEach((mov, idx) => {
        console.log(`${idx + 1}. ${new Date(mov.date).toLocaleDateString()} - ${mov.type}`);
        console.log(`   Product ID: ${mov.productId}`);
        console.log(`   Warehouse ID: ${mov.warehouseId}`);
        console.log(`   Quantity: ${mov.quantity}`);
        console.log(`   Balance: ${mov.balance}`);
        console.log(`   Remarks: ${mov.remarks}`);
        console.log(`   Created: ${new Date(mov.createdAt).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('  No stock movements found for this order');
    }
    
    console.log('\n💡 ANALYSIS:');
    console.log('='.repeat(80));
    
    // Count movement types
    const outMovements = movements.filter(m => m.type === 'OUT');
    const inMovements = movements.filter(m => m.type === 'IN');
    
    console.log(`OUT movements (stock blocked): ${outMovements.length}`);
    console.log(`IN movements (stock restored): ${inMovements.length}`);
    
    if (order.status === 'Cancelled') {
      if (outMovements.length > 0 && inMovements.length === 0) {
        console.log('\n⚠️  PROBLEM FOUND:');
        console.log('   Order was cancelled but stock was NOT restored!');
        console.log('   Stock was blocked but never unblocked.');
        console.log('\n   Possible reasons:');
        console.log('   1. Order was cancelled from a status other than "Confirmed"');
        console.log('   2. Stock restoration logic failed');
        console.log('   3. Order products/warehouse info was missing during cancellation');
      } else if (outMovements.length === inMovements.length) {
        console.log('\n✅ Stock was properly restored');
      } else if (outMovements.length === 0) {
        console.log('\n✅ No stock was blocked (order was cancelled before confirmation)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

checkOrder();
