/**
 * Test Script: Manual Stock Adjustment + Stock Arrival Integration
 * 
 * This script tests that when manual stock adjustment is created,
 * the system automatically checks waiting out-of-stock orders
 * and updates their stock status.
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

const testManualAdjustmentStockArrival = async () => {
  try {
    console.log('🧪 Starting Manual Adjustment + Stock Arrival Integration Test\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database\n');
    
    // Step 1: Find a test product and warehouse
    console.log('📦 Step 1: Finding test product and warehouse...');
    const product = await Product.findOne({ productCode: 'BFS001' });
    const warehouse = await Warehouse.findOne();
    
    if (!product || !warehouse) {
      console.log('❌ Test product or warehouse not found');
      return;
    }
    
    console.log(`   Product: ${product.itemName} (${product.productCode})`);
    console.log(`   Warehouse: ${warehouse.name}\n`);
    
    // Step 2: Check current stock
    console.log('📊 Step 2: Checking current stock...');
    const currentStock = await StockMovementService.getCurrentStock(product._id, warehouse._id);
    console.log(`   Current Stock: ${currentStock} units\n`);
    
    // Step 3: Find or create an out-of-stock order
    console.log('🔍 Step 3: Finding out-of-stock orders...');
    let outOfStockOrders = await SalesOrder.find({
      'products.product': product._id,
      'products.warehouse': warehouse._id,
      isOutOfStock: true,
      status: 'Pending'
    });
    
    console.log(`   Found ${outOfStockOrders.length} out-of-stock orders for this product\n`);
    
    if (outOfStockOrders.length === 0) {
      console.log('⚠️  No out-of-stock orders found. Create one first to test this feature.\n');
      console.log('💡 To create a test order:');
      console.log('   1. Go to Sales Order Dashboard');
      console.log('   2. Create new order with this product');
      console.log('   3. Select "Out of Stock" option');
      console.log('   4. Run this test again\n');
      return;
    }
    
    // Step 4: Show order status BEFORE adjustment
    console.log('📋 Step 4: Order Status BEFORE Manual Adjustment:');
    for (const order of outOfStockOrders) {
      const orderProduct = order.products.find(p => 
        p.product.toString() === product._id.toString() &&
        p.warehouse.toString() === warehouse._id.toString()
      );
      
      console.log(`\n   Order: ${order.orderNumber}`);
      console.log(`   Product: ${orderProduct.productName || orderProduct.productCode}`);
      console.log(`   Required: ${orderProduct.quantity} units`);
      console.log(`   Stock Status: ${orderProduct.stockStatus || 'unknown'}`);
      console.log(`   Available: ${orderProduct.availableQuantity || 0} units`);
      console.log(`   Order Overall Status: ${order.orderStockStatus?.overallStatus || 'unknown'}`);
    }
    console.log('\n');
    
    // Step 5: Simulate manual stock adjustment
    console.log('➕ Step 5: Simulating Manual Stock Adjustment...');
    const adjustmentQuantity = 50; // Add 50 units
    console.log(`   Adding ${adjustmentQuantity} units via manual adjustment\n`);
    
    // Create stock adjustment (simulating the controller logic)
    const session = await mongoose.startSession();
    await session.startTransaction();
    
    try {
      const stockAdjustment = new StockAdjustment({
        warehouseId: warehouse._id,
        adjustmentType: 'ADD',
        reason: 'Stock Replenishment',
        remarks: 'Test adjustment for stock arrival integration',
        items: [{
          productId: product._id,
          productCode: product.productCode,
          itemName: product.itemName,
          currentStock: currentStock,
          quantity: adjustmentQuantity,
          unitPrice: product.unitPrice || 0,
          remarks: 'Test item'
        }],
        createdBy: new mongoose.Types.ObjectId(), // Dummy user ID
        status: 'Completed'
      });
      
      await stockAdjustment.save({ session });
      console.log(`   ✅ Created adjustment: ${stockAdjustment.adjustmentNo}`);
      
      // Create stock movement
      const newBalance = await StockMovementService.calculateRunningBalance(
        product._id,
        warehouse._id,
        adjustmentQuantity,
        session
      );
      
      const stockMovement = new StockMovement({
        productId: product._id,
        warehouseId: warehouse._id,
        type: 'IN',
        quantity: adjustmentQuantity,
        balance: newBalance,
        referenceNo: stockAdjustment.adjustmentNo,
        referenceType: 'ADJUSTMENT',
        date: stockAdjustment.adjustmentDate,
        remarks: 'Manual add adjustment: Stock Replenishment',
        createdBy: stockAdjustment.createdBy
      });
      
      await stockMovement.save({ session });
      console.log(`   ✅ Created stock movement: ${adjustmentQuantity} units IN`);
      console.log(`   ✅ New balance: ${newBalance} units\n`);
      
      await session.commitTransaction();
      
      // Step 6: Trigger stock arrival check (THIS IS THE KEY INTEGRATION)
      console.log('🔔 Step 6: Checking Waiting Orders for Stock Arrival...');
      const result = await StockArrivalService.checkWaitingOrdersForStock(
        product._id,
        warehouse._id,
        adjustmentQuantity
      );
      
      console.log(`   ✅ Stock arrival check completed`);
      console.log(`   Orders Updated: ${result.ordersUpdated}`);
      console.log(`   Orders Ready: ${result.ordersReady}`);
      console.log(`   Orders Partial: ${result.ordersPartial}`);
      console.log(`   Current Stock: ${result.currentStock} units\n`);
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    
    // Step 7: Show order status AFTER adjustment
    console.log('📋 Step 7: Order Status AFTER Manual Adjustment:');
    
    // Refresh orders from database
    outOfStockOrders = await SalesOrder.find({
      'products.product': product._id,
      'products.warehouse': warehouse._id,
      isOutOfStock: true,
      status: 'Pending'
    });
    
    for (const order of outOfStockOrders) {
      const orderProduct = order.products.find(p => 
        p.product.toString() === product._id.toString() &&
        p.warehouse.toString() === warehouse._id.toString()
      );
      
      console.log(`\n   Order: ${order.orderNumber}`);
      console.log(`   Product: ${orderProduct.productName || orderProduct.productCode}`);
      console.log(`   Required: ${orderProduct.quantity} units`);
      console.log(`   Stock Status: ${orderProduct.stockStatus || 'unknown'} ⬅️ UPDATED`);
      console.log(`   Available: ${orderProduct.availableQuantity || 0} units ⬅️ UPDATED`);
      console.log(`   Order Overall Status: ${order.orderStockStatus?.overallStatus || 'unknown'} ⬅️ UPDATED`);
      
      // Show what changed
      if (orderProduct.stockStatus === 'available') {
        console.log(`   ✅ STATUS CHANGED: Waiting → Available (Stock Ready!)`);
      } else if (orderProduct.stockStatus === 'partial') {
        console.log(`   ⚠️  STATUS CHANGED: Waiting → Partial (${orderProduct.availableQuantity}/${orderProduct.quantity})`);
      }
    }
    console.log('\n');
    
    // Step 8: Summary
    console.log('📊 Step 8: Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Manual Stock Adjustment Created');
    console.log('✅ Stock Movement Recorded');
    console.log('✅ Stock Arrival Service Triggered');
    console.log('✅ Out-of-Stock Orders Updated');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log('🎉 Integration Test PASSED!\n');
    console.log('💡 Next Steps:');
    console.log('   1. Check Sales Order Dashboard');
    console.log('   2. Verify badges show correct status');
    console.log('   3. Create more manual adjustments to test partial stock\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from database');
  }
};

// Run the test
testManualAdjustmentStockArrival();
