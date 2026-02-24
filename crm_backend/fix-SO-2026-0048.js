import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Stock from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import Dealer from './models/Dealer.js';
import StockArrivalService from './services/stockArrivalService.js';

dotenv.config();

const fixOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB\n');

    const orderNumber = 'SO-2026-0048';
    console.log(`${'='.repeat(80)}`);
    console.log(`FIXING ORDER: ${orderNumber}`);
    console.log(`${'='.repeat(80)}\n`);

    // Find the order
    const order = await SalesOrder.findOne({ orderNumber })
      .populate('dealer', 'name code')
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name');

    if (!order) {
      console.log(`❌ Order ${orderNumber} not found`);
      return;
    }

    console.log(`📋 ORDER FOUND:`);
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Dealer: ${order.dealer?.name}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Total Products: ${order.products.length}\n`);

    console.log(`${'='.repeat(80)}`);
    console.log(`CHECKING CURRENT STOCK FOR EACH PRODUCT:`);
    console.log(`${'='.repeat(80)}\n`);

    let needsUpdate = false;

    for (let i = 0; i < order.products.length; i++) {
      const product = order.products[i];
      console.log(`${i + 1}. ${product.product?.itemName || 'Unknown'}`);
      console.log(`   Ordered Quantity: ${product.quantity}`);
      console.log(`   Current Stock Status: ${product.stockStatus}`);
      console.log(`   Available Quantity: ${product.availableQuantity || 0}`);
      console.log(`   Warehouse: ${product.warehouse?.name || 'N/A'}`);

      if (product.warehouse) {
        // Check current stock
        const currentStock = await Stock.findOne({
          productId: product.product._id,
          warehouseId: product.warehouse._id
        });

        if (currentStock) {
          console.log(`   📊 Current Stock in Warehouse: ${currentStock.quantity}`);
          console.log(`   📊 Blocked: ${currentStock.blockedQty || 0}`);
          console.log(`   📊 Net Stock: ${currentStock.netStock || currentStock.quantity}`);

          // Determine what the stock status SHOULD be
          const availableStock = currentStock.netStock || currentStock.quantity;
          let correctStatus = 'unknown';
          let correctAvailableQty = 0;

          if (availableStock >= product.quantity) {
            correctStatus = 'available';
            correctAvailableQty = product.quantity;
          } else if (availableStock > 0) {
            correctStatus = 'partial';
            correctAvailableQty = availableStock;
          } else {
            correctStatus = 'waiting';
            correctAvailableQty = 0;
          }

          console.log(`   ✅ Correct Status Should Be: ${correctStatus} (${correctAvailableQty}/${product.quantity})`);

          // Check if update is needed
          if (product.stockStatus !== correctStatus || product.availableQuantity !== correctAvailableQty) {
            console.log(`   ⚠️ NEEDS UPDATE!`);
            needsUpdate = true;

            // Update the product's stock status
            product.stockStatus = correctStatus;
            product.availableQuantity = correctAvailableQty;
            product.stockCheckedAt = new Date();

            if (correctStatus === 'available') {
              product.stockArrivedAt = new Date();
            }
          } else {
            console.log(`   ✅ Status is correct`);
          }
        } else {
          console.log(`   ⚠️ No stock record found for this product in this warehouse`);
        }
      } else {
        console.log(`   ⚠️ No warehouse assigned`);
      }

      console.log('');
    }

    if (needsUpdate) {
      console.log(`${'='.repeat(80)}`);
      console.log(`UPDATING ORDER STOCK STATUS:`);
      console.log(`${'='.repeat(80)}\n`);

      // Recalculate order-level stock status
      const totalProducts = order.products.length;
      const availableProducts = order.products.filter(p => p.stockStatus === 'available').length;
      const partialProducts = order.products.filter(p => p.stockStatus === 'partial').length;
      const waitingProducts = order.products.filter(p => p.stockStatus === 'waiting').length;

      let overallStatus = 'unknown';
      if (waitingProducts === totalProducts) {
        overallStatus = 'waiting';
      } else if (availableProducts === totalProducts) {
        overallStatus = 'ready';
      } else {
        overallStatus = 'partial';
      }

      order.orderStockStatus = {
        totalProducts,
        availableProducts,
        partialProducts,
        waitingProducts,
        overallStatus,
        lastChecked: new Date()
      };

      console.log(`📊 Order Stock Status:`);
      console.log(`   Total Products: ${totalProducts}`);
      console.log(`   Available: ${availableProducts}`);
      console.log(`   Partial: ${partialProducts}`);
      console.log(`   Waiting: ${waitingProducts}`);
      console.log(`   Overall Status: ${overallStatus}\n`);

      // Save the order
      await order.save();
      console.log(`✅ Order ${orderNumber} updated successfully!\n`);

      // Check if order is now ready
      if (overallStatus === 'ready') {
        console.log(`🎉 ALL STOCK IS NOW AVAILABLE!`);
        console.log(`   The order can now be confirmed and processed.\n`);
      } else if (overallStatus === 'partial') {
        console.log(`⚠️ PARTIAL STOCK AVAILABLE`);
        console.log(`   Some products are available, but not all.\n`);
      } else {
        console.log(`⏳ STILL WAITING FOR STOCK`);
        console.log(`   No products are available yet.\n`);
      }
    } else {
      console.log(`✅ No updates needed - stock status is already correct\n`);
    }

    console.log(`${'='.repeat(80)}`);
    console.log(`FIX COMPLETE`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

fixOrder();
