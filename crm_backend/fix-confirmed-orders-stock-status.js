import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import StockMovementService from './services/stockMovementService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Fix Script: Initialize Stock Status for Confirmed Orders
 * 
 * Problem: Confirmed orders showing "Unknown" stock status
 * Root Cause: Stock status only initialized for out-of-stock orders
 * Solution: Initialize stock status for ALL confirmed orders
 */

const fixConfirmedOrdersStockStatus = async () => {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected\n');

    // Find all confirmed orders without proper stock status
    const confirmedOrders = await SalesOrder.find({
      status: 'Confirmed',
      $or: [
        { 'orderStockStatus.overallStatus': 'unknown' },
        { 'orderStockStatus.overallStatus': { $exists: false } },
        { 'orderStockStatus.totalProducts': 0 },
        { 'products.stockStatus': 'unknown' },
        { 'products.stockStatus': { $exists: false } }
      ]
    });

    console.log(`Found ${confirmedOrders.length} confirmed orders needing stock status update\n`);

    if (confirmedOrders.length === 0) {
      console.log('✅ No orders need fixing');
      process.exit(0);
    }

    let fixed = 0;
    let errors = 0;

    for (const order of confirmedOrders) {
      try {
        console.log(`\n📋 Processing ${order.orderNumber}...`);
        
        let availableCount = 0;
        let partialCount = 0;
        let waitingCount = 0;
        let updated = false;

        // Check and update stock status for each product
        for (const product of order.products) {
          if (!product.warehouse || !product.product) {
            console.log(`   ⚠️  Skipping product without warehouse/product ID`);
            continue;
          }

          try {
            // Get current stock
            const currentStock = await StockMovementService.getCurrentStock(
              product.product,
              product.warehouse
            );

            const oldStatus = product.stockStatus;
            const oldAvailable = product.availableQuantity || 0;

            // Calculate available quantity
            product.availableQuantity = Math.min(currentStock, product.quantity);

            // Determine stock status
            if (currentStock >= product.quantity) {
              product.stockStatus = 'available';
              availableCount++;
            } else if (currentStock > 0) {
              product.stockStatus = 'partial';
              partialCount++;
            } else {
              product.stockStatus = 'waiting';
              waitingCount++;
            }

            product.stockCheckedAt = new Date();

            if (oldStatus !== product.stockStatus || oldAvailable !== product.availableQuantity) {
              updated = true;
              console.log(`   ✅ ${product.productCode}: ${oldStatus || 'unknown'} → ${product.stockStatus} (${product.availableQuantity}/${product.quantity})`);
            }
          } catch (stockError) {
            console.log(`   ❌ Error checking stock for product ${product.productCode}: ${stockError.message}`);
          }
        }

        // Update order-level stock status
        order.orderStockStatus = {
          totalProducts: order.products.length,
          availableProducts: availableCount,
          partialProducts: partialCount,
          waitingProducts: waitingCount,
          lastChecked: new Date()
        };

        // Determine overall status
        if (availableCount === order.products.length) {
          order.orderStockStatus.overallStatus = 'ready';
        } else if (availableCount > 0 || partialCount > 0) {
          order.orderStockStatus.overallStatus = 'partial';
        } else {
          order.orderStockStatus.overallStatus = 'waiting';
        }

        if (updated || order.orderStockStatus.totalProducts === 0) {
          await order.save();
          fixed++;
          console.log(`   ✅ Order ${order.orderNumber} fixed: ${order.orderStockStatus.overallStatus} (${availableCount}/${order.products.length} available)`);
        } else {
          console.log(`   ℹ️  Order ${order.orderNumber} already up to date`);
        }
      } catch (orderError) {
        errors++;
        console.error(`   ❌ Error processing order ${order.orderNumber}:`, orderError.message);
      }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Summary:`);
    console.log(`   Total Orders Processed: ${confirmedOrders.length}`);
    console.log(`   Successfully Fixed: ${fixed}`);
    console.log(`   Errors: ${errors}`);
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixConfirmedOrdersStockStatus();
