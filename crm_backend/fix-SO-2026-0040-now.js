import dotenv from 'dotenv';
import mongoose from 'mongoose';
import StockArrivalService from './services/stockArrivalService.js';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

async function fixOrder() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    const orderNumber = 'SO-2026-0040';
    
    // Get the order
    const order = await SalesOrder.findOne({ orderNumber });
    
    if (!order) {
      console.log('❌ Order not found');
      return;
    }

    console.log('📦 BEFORE FIX:');
    console.log('==============');
    console.log('Is Out of Stock:', order.isOutOfStock);
    console.log('Order Stock Status:', order.orderStockStatus?.overallStatus);
    
    // Fix: Set isOutOfStock to true so the system tracks it
    order.isOutOfStock = true;
    await order.save();
    console.log('\n✅ Set isOutOfStock = true');
    
    // Now refresh the stock status
    console.log('\n🔄 Refreshing stock status...');
    const result = await StockArrivalService.checkOrderStockStatus(order._id);
    
    console.log('\n📦 AFTER FIX:');
    console.log('=============');
    console.log('Success:', result.success);
    console.log('Order Stock Status:', result.orderStockStatus?.overallStatus);
    console.log('Available Products:', result.orderStockStatus?.availableProducts);
    console.log('Total Products:', result.orderStockStatus?.totalProducts);
    
    console.log('\n✅ Order fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

fixOrder();
