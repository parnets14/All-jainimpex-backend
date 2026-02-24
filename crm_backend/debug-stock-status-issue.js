import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import StockMovementService from './services/stockMovementService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Debug Script: Investigate Stock Status Issues
 * 
 * Issues reported:
 * 1. Confirmed orders showing "Unknown" stock status
 * 2. Multiple products in one order not properly differentiated
 * 3. Orders 41, 42, 43, 44, 45 have separation issues
 */

const debugStockStatus = async () => {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected\n');

    // Check orders mentioned: SO-2026-0043, 0042, 0041, 0040
    const orderNumbers = ['SO-2026-0043', 'SO-2026-0042', 'SO-2026-0041', 'SO-2026-0040', 'SO-2026-0039'];
    
    for (const orderNumber of orderNumbers) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📋 Analyzing Order: ${orderNumber}`);
      console.log('='.repeat(80));
      
      const order = await SalesOrder.findOne({ orderNumber })
        .populate('products.product', 'itemName productCode')
        .populate('products.warehouse', 'name');
      
      if (!order) {
        console.log(`❌ Order ${orderNumber} not found`);
        continue;
      }
      
      console.log(`\n📊 Order Details:`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Is Out of Stock: ${order.isOutOfStock}`);
      console.log(`   Products Count: ${order.products.length}`);
      console.log(`   Order Stock Status:`, order.orderStockStatus || 'NOT SET');
      
      console.log(`\n📦 Products in Order:`);
      for (let i = 0; i < order.products.length; i++) {
        const product = order.products[i];
        console.log(`\n   Product ${i + 1}:`);
        console.log(`      Name: ${product.product?.itemName || 'N/A'}`);
        console.log(`      Code: ${product.product?.productCode || product.productCode}`);
        console.log(`      Warehouse: ${product.warehouse?.name || 'N/A'} (${product.warehouse?._id})`);
        console.log(`      Quantity: ${product.quantity}`);
        console.log(`      Stock Status: ${product.stockStatus || 'NOT SET'}`);
        console.log(`      Available Quantity: ${product.availableQuantity || 0}`);
        console.log(`      Stock Checked At: ${product.stockCheckedAt || 'NEVER'}`);
        console.log(`      Stock Arrived At: ${product.stockArrivedAt || 'N/A'}`);
        
        // Check actual stock in warehouse
        if (product.warehouse && product.product) {
          try {
            const currentStock = await StockMovementService.getCurrentStock(
              product.product._id,
              product.warehouse._id
            );
            console.log(`      ✅ Current Stock in Warehouse: ${currentStock} units`);
            
            // Determine what status SHOULD be
            let shouldBeStatus = 'unknown';
            if (currentStock >= product.quantity) {
              shouldBeStatus = 'available';
            } else if (currentStock > 0) {
              shouldBeStatus = 'partial';
            } else {
              shouldBeStatus = 'waiting';
            }
            
            console.log(`      🎯 Should Be Status: ${shouldBeStatus}`);
            
            if (product.stockStatus !== shouldBeStatus) {
              console.log(`      ⚠️  MISMATCH! Current: ${product.stockStatus || 'NOT SET'}, Should be: ${shouldBeStatus}`);
            }
          } catch (stockError) {
            console.log(`      ❌ Error checking stock: ${stockError.message}`);
          }
        }
      }
      
      // Check if order-level status matches product-level status
      if (order.orderStockStatus) {
        console.log(`\n🔍 Order-Level Stock Status Analysis:`);
        console.log(`   Overall Status: ${order.orderStockStatus.overallStatus}`);
        console.log(`   Total Products: ${order.orderStockStatus.totalProducts}`);
        console.log(`   Available: ${order.orderStockStatus.availableProducts}`);
        console.log(`   Partial: ${order.orderStockStatus.partialProducts}`);
        console.log(`   Waiting: ${order.orderStockStatus.waitingProducts}`);
        console.log(`   Last Checked: ${order.orderStockStatus.lastChecked}`);
        
        // Verify counts
        let actualAvailable = 0;
        let actualPartial = 0;
        let actualWaiting = 0;
        let actualUnknown = 0;
        
        for (const product of order.products) {
          if (product.stockStatus === 'available') actualAvailable++;
          else if (product.stockStatus === 'partial') actualPartial++;
          else if (product.stockStatus === 'waiting') actualWaiting++;
          else actualUnknown++;
        }
        
        console.log(`\n   Actual Product Status Counts:`);
        console.log(`      Available: ${actualAvailable}`);
        console.log(`      Partial: ${actualPartial}`);
        console.log(`      Waiting: ${actualWaiting}`);
        console.log(`      Unknown: ${actualUnknown}`);
        
        if (actualAvailable !== order.orderStockStatus.availableProducts ||
            actualPartial !== order.orderStockStatus.partialProducts ||
            actualWaiting !== order.orderStockStatus.waitingProducts) {
          console.log(`\n   ⚠️  MISMATCH between order-level and product-level counts!`);
        }
      } else {
        console.log(`\n⚠️  Order-level stock status NOT SET`);
      }
    }
    
    // Check for orders with "Confirmed" status and unknown stock status
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`🔍 Checking All Confirmed Orders with Stock Status Issues`);
    console.log('='.repeat(80));
    
    const confirmedOrders = await SalesOrder.find({
      status: 'Confirmed'
    }).select('orderNumber status isOutOfStock orderStockStatus products');
    
    console.log(`\nFound ${confirmedOrders.length} confirmed orders`);
    
    let ordersWithUnknownStatus = 0;
    let ordersWithoutStockStatus = 0;
    let ordersWithMismatch = 0;
    
    for (const order of confirmedOrders) {
      let hasUnknown = false;
      let hasNoStatus = false;
      
      for (const product of order.products) {
        if (!product.stockStatus || product.stockStatus === 'unknown') {
          hasUnknown = true;
          hasNoStatus = !product.stockStatus;
        }
      }
      
      if (hasUnknown) {
        ordersWithUnknownStatus++;
        console.log(`\n   ⚠️  ${order.orderNumber}: Has products with ${hasNoStatus ? 'NO' : 'UNKNOWN'} stock status`);
        console.log(`      Is Out of Stock: ${order.isOutOfStock}`);
        console.log(`      Order Stock Status: ${order.orderStockStatus?.overallStatus || 'NOT SET'}`);
      }
      
      if (!order.orderStockStatus && order.isOutOfStock) {
        ordersWithoutStockStatus++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total Confirmed Orders: ${confirmedOrders.length}`);
    console.log(`   Orders with Unknown/Missing Stock Status: ${ordersWithUnknownStatus}`);
    console.log(`   Out-of-Stock Orders without Order-Level Status: ${ordersWithoutStockStatus}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

debugStockStatus();
