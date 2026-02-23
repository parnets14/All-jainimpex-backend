/**
 * Fix Script: Initialize Stock Tracking for SO-2026-0040
 * 
 * This script initializes stock tracking fields for order SO-2026-0040
 * and triggers stock arrival check
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import StockArrivalService from './services/stockArrivalService.js';

dotenv.config();

const fixOrder = async () => {
  try {
    console.log('🔧 Fixing Order SO-2026-0040\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');
    
    // Find the order
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0040' });
    
    if (!order) {
      console.log('❌ Order not found!');
      return;
    }
    
    console.log(`📋 Found order: ${order.orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Is Out of Stock: ${order.isOutOfStock}`);
    console.log(`   Products: ${order.products.length}\n`);
    
    // Initialize stock tracking fields for each product
    console.log('🔄 Initializing stock tracking fields...\n');
    
    order.products.forEach((product, idx) => {
      console.log(`   Product ${idx + 1}: ${product.productCode}`);
      console.log(`   Before: stockStatus = ${product.stockStatus || 'undefined'}`);
      
      product.stockStatus = 'waiting';
      product.availableQuantity = 0;
      product.stockCheckedAt = new Date();
      
      console.log(`   After: stockStatus = ${product.stockStatus}`);
      console.log('');
    });
    
    // Initialize order-level stock status
    order.orderStockStatus = {
      totalProducts: order.products.length,
      availableProducts: 0,
      partialProducts: 0,
      waitingProducts: order.products.length,
      overallStatus: 'waiting',
      lastChecked: new Date()
    };
    
    console.log('💾 Saving order...');
    await order.save();
    console.log('✅ Order saved\n');
    
    // Trigger stock arrival check
    console.log('🔔 Triggering stock arrival check...\n');
    
    for (const product of order.products) {
      if (product.product && product.warehouse) {
        console.log(`   Checking: ${product.productCode}`);
        
        try {
          const result = await StockArrivalService.checkWaitingOrdersForStock(
            product.product,
            product.warehouse,
            0
          );
          
          console.log(`   ✅ Check completed:`);
          console.log(`      Orders Updated: ${result.ordersUpdated}`);
          console.log(`      Orders Ready: ${result.ordersReady}`);
          console.log(`      Current Stock: ${result.currentStock}\n`);
        } catch (error) {
          console.log(`   ❌ Check failed: ${error.message}\n`);
        }
      }
    }
    
    // Re-fetch order to show final state
    const updatedOrder = await SalesOrder.findOne({ orderNumber: 'SO-2026-0040' });
    
    console.log('📊 Final Order State:');
    console.log(`   Overall Status: ${updatedOrder.orderStockStatus?.overallStatus || 'unknown'}`);
    console.log(`   Available Products: ${updatedOrder.orderStockStatus?.availableProducts || 0}/${updatedOrder.orderStockStatus?.totalProducts || 0}`);
    console.log('');
    
    updatedOrder.products.forEach((product, idx) => {
      console.log(`   Product ${idx + 1}: ${product.productCode}`);
      console.log(`   - Stock Status: ${product.stockStatus}`);
      console.log(`   - Available: ${product.availableQuantity}/${product.quantity}`);
    });
    console.log('');
    
    console.log('🎉 Fix completed successfully!');
    console.log('');
    console.log('💡 Next Steps:');
    console.log('   1. Refresh Sales Order Dashboard');
    console.log('   2. Verify badges show correctly');
    console.log('   3. If stock is available, status should show "Ready"');
    console.log('   4. If no stock, status should show "Waiting"');
    console.log('');
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

// Run the fix
fixOrder();
