import dotenv from 'dotenv';
import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

async function debugOrder() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const orderNumber = 'SO-2026-0040';
    
    // Get the order
    const order = await SalesOrder.findOne({ orderNumber })
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name');
    
    if (!order) {
      console.log('❌ Order not found');
      return;
    }

    console.log('📦 ORDER DETAILS');
    console.log('================');
    console.log('Order Number:', order.orderNumber);
    console.log('Status:', order.status);
    console.log('Is Out of Stock:', order.isOutOfStock);
    console.log('Order Stock Status:', JSON.stringify(order.orderStockStatus, null, 2));
    console.log('\n📋 PRODUCTS IN ORDER:');
    console.log('====================');
    
    for (const prod of order.products) {
      const productId = prod.product._id || prod.product;
      const warehouseId = prod.warehouse._id || prod.warehouse;
      
      console.log(`\n🔹 Product: ${prod.productName || prod.product.itemName}`);
      console.log(`   Product Code: ${prod.productCode || prod.product.productCode}`);
      console.log(`   Warehouse: ${prod.warehouseName || prod.warehouse?.name || 'Unknown'}`);
      console.log(`   Ordered Quantity: ${prod.quantity}`);
      console.log(`   Stock Status: ${prod.stockStatus || 'NOT SET'}`);
      console.log(`   Available Quantity: ${prod.availableQuantity || 0}`);
      console.log(`   Stock Checked At: ${prod.stockCheckedAt || 'NEVER'}`);
      
      // Get current stock from movements
      const movements = await StockMovement.find({
        productId: productId,
        warehouseId: warehouseId
      }).sort({ date: 1, createdAt: 1 });
      
      let currentStock = 0;
      movements.forEach(m => {
        if (m.type === 'IN') currentStock += m.quantity;
        else if (m.type === 'OUT') currentStock -= m.quantity;
      });
      
      console.log(`   📊 ACTUAL CURRENT STOCK: ${currentStock} units`);
      console.log(`   ✅ Stock sufficient: ${currentStock >= prod.quantity ? 'YES' : 'NO'}`);
      
      // Show recent movements
      console.log(`   📜 Recent movements (last 5):`);
      const recentMovements = movements.slice(-5);
      recentMovements.forEach(m => {
        console.log(`      ${m.date.toISOString().split('T')[0]} | ${m.type} | Qty: ${m.quantity} | Balance: ${m.balance} | Ref: ${m.referenceNo}`);
      });
    }
    
    console.log('\n\n🔍 DIAGNOSIS:');
    console.log('=============');
    
    if (!order.orderStockStatus) {
      console.log('❌ PROBLEM: orderStockStatus is missing - order was created before stock tracking was added');
      console.log('✅ SOLUTION: Need to initialize stock tracking fields');
    } else if (order.orderStockStatus.overallStatus === 'waiting') {
      console.log('⚠️  PROBLEM: Stock status shows "waiting" but stock may be available');
      console.log('✅ SOLUTION: Need to refresh stock status');
    }
    
    console.log('\n💡 RECOMMENDED ACTION:');
    console.log('Call the refresh endpoint: POST /api/sales-orders/refresh-by-order-number/SO-2026-0040');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

debugOrder();
