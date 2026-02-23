/**
 * Debug Script: Stock Arrival for SO-2026-0040
 * 
 * This script investigates why stock arrival tracking isn't working
 * for order SO-2026-0040 after manual adjustment ADJ-20260223-002
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import StockAdjustment from './models/StockAdjustment.js';
import StockMovement from './models/Stock.js';
import StockMovementService from './services/stockMovementService.js';
import StockArrivalService from './services/stockArrivalService.js';

dotenv.config();

const debugStockArrival = async () => {
  try {
    console.log('🔍 DEBUG: Stock Arrival for SO-2026-0040\n');
    console.log('='.repeat(80));
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');
    
    // Step 1: Find the order
    console.log('📋 Step 1: Finding Order SO-2026-0040...');
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0040' })
      .populate('dealer', 'name')
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name');
    
    if (!order) {
      console.log('❌ Order not found!');
      return;
    }
    
    console.log(`✅ Found order: ${order.orderNumber}`);
    console.log(`   Dealer: ${order.dealer?.name || order.dealerName}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Is Out of Stock: ${order.isOutOfStock}`);
    console.log(`   Products: ${order.products.length}`);
    console.log('');
    
    // Step 2: Check order stock status fields
    console.log('📊 Step 2: Checking Order Stock Status Fields...');
    console.log(`   orderStockStatus exists: ${!!order.orderStockStatus}`);
    if (order.orderStockStatus) {
      console.log(`   Overall Status: ${order.orderStockStatus.overallStatus}`);
      console.log(`   Total Products: ${order.orderStockStatus.totalProducts}`);
      console.log(`   Available Products: ${order.orderStockStatus.availableProducts}`);
      console.log(`   Partial Products: ${order.orderStockStatus.partialProducts}`);
      console.log(`   Waiting Products: ${order.orderStockStatus.waitingProducts}`);
      console.log(`   Last Checked: ${order.orderStockStatus.lastChecked}`);
    } else {
      console.log('   ⚠️  orderStockStatus field is missing!');
    }
    console.log('');
    
    // Step 3: Check each product in the order
    console.log('📦 Step 3: Checking Products in Order...');
    for (let i = 0; i < order.products.length; i++) {
      const product = order.products[i];
      console.log(`\n   Product ${i + 1}:`);
      console.log(`   - Product Code: ${product.productCode}`);
      console.log(`   - Product Name: ${product.productName || product.product?.itemName}`);
      console.log(`   - Quantity Required: ${product.quantity}`);
      console.log(`   - Warehouse: ${product.warehouseName || product.warehouse?.name}`);
      console.log(`   - Warehouse ID: ${product.warehouse}`);
      console.log(`   - Stock Status: ${product.stockStatus || 'NOT SET'}`);
      console.log(`   - Available Quantity: ${product.availableQuantity || 0}`);
      console.log(`   - Stock Arrived At: ${product.stockArrivedAt || 'NOT SET'}`);
      console.log(`   - Stock Checked At: ${product.stockCheckedAt || 'NOT SET'}`);
      
      // Check current stock for this product
      if (product.product && product.warehouse) {
        const currentStock = await StockMovementService.getCurrentStock(
          product.product._id || product.product,
          product.warehouse._id || product.warehouse
        );
        console.log(`   - Current Stock in System: ${currentStock} units`);
        
        if (currentStock >= product.quantity) {
          console.log(`   ✅ SUFFICIENT STOCK (${currentStock} >= ${product.quantity})`);
        } else if (currentStock > 0) {
          console.log(`   ⚠️  PARTIAL STOCK (${currentStock} < ${product.quantity})`);
        } else {
          console.log(`   ❌ NO STOCK (${currentStock} = 0)`);
        }
      }
    }
    console.log('');
    
    // Step 4: Find the manual adjustment
    console.log('📝 Step 4: Finding Manual Adjustment ADJ-20260223-002...');
    const adjustment = await StockAdjustment.findOne({ adjustmentNo: 'ADJ-20260223-002' })
      .populate('warehouseId', 'name')
      .populate('items.productId', 'itemName productCode');
    
    if (!adjustment) {
      console.log('❌ Adjustment not found!');
    } else {
      console.log(`✅ Found adjustment: ${adjustment.adjustmentNo}`);
      console.log(`   Type: ${adjustment.adjustmentType}`);
      console.log(`   Warehouse: ${adjustment.warehouseId?.name}`);
      console.log(`   Warehouse ID: ${adjustment.warehouseId?._id}`);
      console.log(`   Items: ${adjustment.items.length}`);
      console.log('');
      
      adjustment.items.forEach((item, idx) => {
        console.log(`   Item ${idx + 1}:`);
        console.log(`   - Product Code: ${item.productCode}`);
        console.log(`   - Product Name: ${item.itemName}`);
        console.log(`   - Product ID: ${item.productId?._id || item.productId}`);
        console.log(`   - Quantity: ${item.quantity}`);
      });
      console.log('');
      
      // Step 5: Check if product in adjustment matches product in order
      console.log('🔗 Step 5: Matching Products...');
      for (const orderProduct of order.products) {
        for (const adjItem of adjustment.items) {
          const orderProductId = (orderProduct.product?._id || orderProduct.product).toString();
          const adjProductId = (adjItem.productId?._id || adjItem.productId).toString();
          const orderWarehouseId = (orderProduct.warehouse?._id || orderProduct.warehouse).toString();
          const adjWarehouseId = adjustment.warehouseId._id.toString();
          
          console.log(`\n   Comparing:`);
          console.log(`   Order Product ID: ${orderProductId}`);
          console.log(`   Adj Product ID: ${adjProductId}`);
          console.log(`   Order Warehouse ID: ${orderWarehouseId}`);
          console.log(`   Adj Warehouse ID: ${adjWarehouseId}`);
          
          if (orderProductId === adjProductId && orderWarehouseId === adjWarehouseId) {
            console.log(`   ✅ MATCH FOUND!`);
            console.log(`   - Product: ${adjItem.productCode}`);
            console.log(`   - Warehouse: ${adjustment.warehouseId.name}`);
            console.log(`   - Quantity Added: ${adjItem.quantity}`);
          } else {
            if (orderProductId !== adjProductId) {
              console.log(`   ❌ Product ID mismatch`);
            }
            if (orderWarehouseId !== adjWarehouseId) {
              console.log(`   ❌ Warehouse ID mismatch`);
            }
          }
        }
      }
      console.log('');
    }
    
    // Step 6: Manually trigger stock arrival check
    console.log('🔔 Step 6: Manually Triggering Stock Arrival Check...');
    console.log('');
    
    for (const product of order.products) {
      if (product.product && product.warehouse) {
        const productId = product.product._id || product.product;
        const warehouseId = product.warehouse._id || product.warehouse;
        
        console.log(`   Checking: ${product.productCode} in ${product.warehouseName}`);
        
        try {
          const result = await StockArrivalService.checkWaitingOrdersForStock(
            productId,
            warehouseId,
            0 // No specific quantity, just check current stock
          );
          
          console.log(`   ✅ Check completed:`);
          console.log(`      Orders Updated: ${result.ordersUpdated}`);
          console.log(`      Orders Ready: ${result.ordersReady}`);
          console.log(`      Orders Partial: ${result.ordersPartial}`);
          console.log(`      Current Stock: ${result.currentStock}`);
        } catch (error) {
          console.log(`   ❌ Check failed: ${error.message}`);
        }
        console.log('');
      }
    }
    
    // Step 7: Re-fetch order to see if it was updated
    console.log('🔄 Step 7: Re-fetching Order After Manual Check...');
    const updatedOrder = await SalesOrder.findOne({ orderNumber: 'SO-2026-0040' });
    
    console.log(`   orderStockStatus exists: ${!!updatedOrder.orderStockStatus}`);
    if (updatedOrder.orderStockStatus) {
      console.log(`   Overall Status: ${updatedOrder.orderStockStatus.overallStatus}`);
      console.log(`   Available Products: ${updatedOrder.orderStockStatus.availableProducts}/${updatedOrder.orderStockStatus.totalProducts}`);
    }
    
    console.log('');
    updatedOrder.products.forEach((product, idx) => {
      console.log(`   Product ${idx + 1}:`);
      console.log(`   - Stock Status: ${product.stockStatus || 'NOT SET'}`);
      console.log(`   - Available Quantity: ${product.availableQuantity || 0}/${product.quantity}`);
    });
    console.log('');
    
    // Step 8: Summary
    console.log('📊 Step 8: Summary & Diagnosis');
    console.log('='.repeat(80));
    
    if (!order.orderStockStatus) {
      console.log('❌ ISSUE: orderStockStatus field is missing from order');
      console.log('   This means the order was created before stock arrival tracking was implemented');
      console.log('   SOLUTION: Run manual refresh or recreate the order');
    }
    
    if (order.products.some(p => !p.stockStatus)) {
      console.log('❌ ISSUE: Some products missing stockStatus field');
      console.log('   SOLUTION: Run manual stock status check');
    }
    
    if (adjustment && order.products.length > 0) {
      const adjProductId = (adjustment.items[0].productId?._id || adjustment.items[0].productId).toString();
      const orderProductId = (order.products[0].product?._id || order.products[0].product).toString();
      const adjWarehouseId = adjustment.warehouseId._id.toString();
      const orderWarehouseId = (order.products[0].warehouse?._id || order.products[0].warehouse).toString();
      
      if (adjProductId !== orderProductId) {
        console.log('❌ ISSUE: Product in adjustment does not match product in order');
        console.log(`   Adjustment Product: ${adjustment.items[0].productCode}`);
        console.log(`   Order Product: ${order.products[0].productCode}`);
      }
      
      if (adjWarehouseId !== orderWarehouseId) {
        console.log('❌ ISSUE: Warehouse in adjustment does not match warehouse in order');
        console.log(`   Adjustment Warehouse: ${adjustment.warehouseId.name}`);
        console.log(`   Order Warehouse: ${order.products[0].warehouseName}`);
      }
    }
    
    console.log('');
    console.log('💡 RECOMMENDATIONS:');
    console.log('   1. Check if order was created before stock arrival tracking was added');
    console.log('   2. Verify product and warehouse IDs match between order and adjustment');
    console.log('   3. Run manual refresh: POST /api/sales-orders/:id/refresh-stock-status');
    console.log('   4. Check backend logs for StockArrivalService errors');
    console.log('');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

// Run the debug
debugStockArrival();
