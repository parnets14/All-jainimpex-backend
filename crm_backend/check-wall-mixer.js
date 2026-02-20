import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';

dotenv.config();

const checkWallMixer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');
    
    console.log('🔍 Checking v oren wall mixer (51654165)\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Find all orders with this product
    const orders = await SalesOrder.find({
      'products.productCode': '51654165'
    }).sort({ createdAt: -1 }).limit(5).lean();
    
    console.log('📦 Orders with v oren wall mixer:\n');
    orders.forEach(order => {
      const product = order.products.find(p => p.productCode === '51654165');
      console.log(`Order: ${order.orderNumber}`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Is Out of Stock: ${order.isOutOfStock}`);
      console.log(`  Sales Type: ${order.salesType}`);
      console.log(`  Quantity: ${product.quantity}`);
      console.log(`  Warehouse: ${product.warehouseName || 'None'}`);
      console.log(`  Warehouse ID: ${product.warehouse || 'None'}`);
      console.log(`  Created: ${new Date(order.createdAt).toLocaleString()}`);
      console.log();
    });
    
    // Find stock movements for these orders
    const orderNumbers = orders.map(o => o.orderNumber);
    const movements = await StockMovement.find({
      referenceNo: { $in: orderNumbers }
    }).sort({ createdAt: -1 }).lean();
    
    console.log('\n📊 Stock Movements for these orders:\n');
    
    if (movements.length === 0) {
      console.log('❌ NO STOCK MOVEMENTS FOUND for these orders!\n');
    } else {
      movements.forEach(m => {
        console.log(`Movement: ${m.type} ${m.quantity} units`);
        console.log(`  Product ID: ${m.productId}`);
        console.log(`  Reference: ${m.referenceNo}`);
        console.log(`  Balance: ${m.balance}`);
        console.log(`  Remarks: ${m.remarks}`);
        console.log(`  Date: ${new Date(m.date).toLocaleString()}`);
        console.log();
      });
    }
    
    // Check the specific in-stock order (SO-2026-0023)
    console.log('\n🎯 Checking specific order SO-2026-0023:\n');
    const order23 = orders.find(o => o.orderNumber === 'SO-2026-0023');
    
    if (order23) {
      console.log('Order Details:');
      console.log(`  Status: ${order23.status}`);
      console.log(`  Is Out of Stock: ${order23.isOutOfStock}`);
      console.log(`  Sales Type: ${order23.salesType}`);
      console.log(`  Created: ${new Date(order23.createdAt).toLocaleString()}`);
      console.log();
      
      const product = order23.products.find(p => p.productCode === '51654165');
      console.log('Product Details:');
      console.log(`  Quantity: ${product.quantity}`);
      console.log(`  Warehouse: ${product.warehouseName}`);
      console.log(`  Warehouse ID: ${product.warehouse}`);
      console.log();
      
      // Check if stock movement exists for this order
      const movement23 = movements.find(m => 
        m.referenceNo === 'SO-2026-0023'
      );
      
      if (movement23) {
        console.log('✅ Stock movement found for SO-2026-0023');
      } else {
        console.log('❌ NO stock movement found for SO-2026-0023');
        console.log('\n🔍 ISSUE IDENTIFIED:');
        console.log('   Order status is "Pending" - stock is only blocked when status is "Confirmed"');
        console.log('   The order was created with status "Pending", so no stock was blocked.');
        console.log('\n💡 SOLUTION:');
        console.log('   Stock will be blocked when the order status is changed to "Confirmed"');
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkWallMixer();
