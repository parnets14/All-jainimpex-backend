import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Stock from './models/Stock.js';
import PurchaseOrder from './models/PurchaseOrder.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const debugOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const orderNumber = 'SO-2026-0048';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DEBUGGING ORDER: ${orderNumber}`);
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

    console.log(`📋 ORDER DETAILS:`);
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Dealer: ${order.dealer?.name} (${order.dealer?.code})`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Created: ${order.createdAt}`);
    console.log(`   Total Products: ${order.products.length}`);

    // Check order stock status
    console.log(`\n📊 ORDER STOCK STATUS:`);
    if (order.orderStockStatus) {
      console.log(`   Total Products: ${order.orderStockStatus.totalProducts}`);
      console.log(`   Available: ${order.orderStockStatus.availableProducts}`);
      console.log(`   Waiting: ${order.orderStockStatus.waitingProducts}`);
      console.log(`   Partially Available: ${order.orderStockStatus.partiallyAvailableProducts}`);
    } else {
      console.log(`   ⚠️ No order stock status found`);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`PRODUCT DETAILS:`);
    console.log(`${'='.repeat(80)}\n`);

    for (let i = 0; i < order.products.length; i++) {
      const product = order.products[i];
      console.log(`\n${i + 1}. ${product.product?.itemName || 'Unknown'} (${product.product?.productCode || 'N/A'})`);
      console.log(`   Quantity Ordered: ${product.quantity}`);
      console.log(`   Warehouse: ${product.warehouse?.name || 'N/A'}`);
      console.log(`   Stock Status: ${product.stockStatus || 'N/A'}`);
      console.log(`   Available Quantity: ${product.availableQuantity || 0}`);
      console.log(`   Waiting Quantity: ${product.waitingQuantity || 0}`);

      // Check stock arrival tracking
      if (product.stockArrival) {
        console.log(`\n   📦 STOCK ARRIVAL TRACKING:`);
        console.log(`      Is Tracking: ${product.stockArrival.isTracking}`);
        console.log(`      Total Needed: ${product.stockArrival.totalNeeded}`);
        console.log(`      Total Arrived: ${product.stockArrival.totalArrived}`);
        console.log(`      Remaining: ${product.stockArrival.remainingQuantity}`);
        console.log(`      Status: ${product.stockArrival.status}`);

        if (product.stockArrival.arrivals && product.stockArrival.arrivals.length > 0) {
          console.log(`\n      ARRIVALS (${product.stockArrival.arrivals.length}):`);
          product.stockArrival.arrivals.forEach((arrival, idx) => {
            console.log(`      ${idx + 1}. Date: ${arrival.arrivalDate}`);
            console.log(`         Quantity: ${arrival.quantity}`);
            console.log(`         Source: ${arrival.source}`);
            console.log(`         PO: ${arrival.purchaseOrderNumber || 'N/A'}`);
            console.log(`         Notes: ${arrival.notes || 'N/A'}`);
          });
        } else {
          console.log(`      ⚠️ No arrivals recorded yet`);
        }
      } else {
        console.log(`   ⚠️ No stock arrival tracking`);
      }

      // Check current stock
      if (product.warehouse) {
        const currentStock = await Stock.findOne({
          productId: product.product._id,
          warehouseId: product.warehouse._id
        });

        if (currentStock) {
          console.log(`\n   📊 CURRENT STOCK:`);
          console.log(`      Quantity: ${currentStock.quantity}`);
          console.log(`      Blocked: ${currentStock.blockedQty}`);
          console.log(`      Net Stock: ${currentStock.netStock}`);
        } else {
          console.log(`\n   ⚠️ No stock record found`);
        }
      } else {
        console.log(`\n   ⚠️ No warehouse assigned to this product`);
      }

      // Check related purchase orders
      const relatedPOs = await PurchaseOrder.find({
        'items.product': product.product._id,
        status: { $in: ['Pending', 'Confirmed', 'Partially Received'] }
      }).select('orderNumber status items.$');

      if (relatedPOs.length > 0) {
        console.log(`\n   🛒 RELATED PURCHASE ORDERS (${relatedPOs.length}):`);
        for (const po of relatedPOs) {
          console.log(`      - ${po.orderNumber} (${po.status})`);
          const poItem = po.items.find(item => item.product.toString() === product.product._id.toString());
          if (poItem) {
            console.log(`        Ordered: ${poItem.quantity}, Received: ${poItem.receivedQuantity || 0}`);
          }
        }
      }

      // Check stock movements - commented out as StockMovement model doesn't exist
      /*
      const movements = await StockMovement.find({
        productId: product.product._id,
        warehouseId: product.warehouse._id,
        salesOrderId: order._id
      }).sort({ createdAt: -1 }).limit(10);

      if (movements.length > 0) {
        console.log(`\n   📝 STOCK MOVEMENTS (Last ${movements.length}):`);
        movements.forEach((mov, idx) => {
          console.log(`      ${idx + 1}. ${mov.movementType} - ${mov.quantity} units`);
          console.log(`         Date: ${mov.createdAt}`);
          console.log(`         Reason: ${mov.reason || 'N/A'}`);
        });
      }
      */
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ANALYSIS:`);
    console.log(`${'='.repeat(80)}\n`);

    // Analyze the issue
    const outOfStockProducts = order.products.filter(p => p.stockStatus === 'waiting');
    const partialProducts = order.products.filter(p => p.stockStatus === 'partial');
    const availableProducts = order.products.filter(p => p.stockStatus === 'available');

    console.log(`Out of Stock Products: ${outOfStockProducts.length}`);
    console.log(`Partially Available: ${partialProducts.length}`);
    console.log(`Available Products: ${availableProducts.length}`);

    if (outOfStockProducts.length > 0) {
      console.log(`\n⚠️ OUT OF STOCK PRODUCTS:`);
      outOfStockProducts.forEach(p => {
        console.log(`   - ${p.product?.itemName}: Needed ${p.quantity}, Available ${p.availableQuantity || 0}`);
        if (p.stockArrival && p.stockArrival.isTracking) {
          console.log(`     Tracking: ${p.stockArrival.totalArrived}/${p.stockArrival.totalNeeded} arrived`);
          console.log(`     Status: ${p.stockArrival.status}`);
        }
      });
    }

    console.log(`\n✅ Debug complete`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
};

debugOrder();
