import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    const orders = await SalesOrder.find().populate('products.product', 'itemName productCode').lean();
    console.log('📊 All Sales Orders:');
    orders.forEach(order => {
      console.log(`\n🔍 Order: ${order.orderNumber}`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - isOutOfStock: ${order.isOutOfStock}`);
      console.log(`   - Products: ${order.products.length}`);
      order.products.forEach(product => {
        console.log(`     * ${product.productName || product.product?.itemName}: ${product.quantity} units`);
        console.log(`       Warehouse: ${product.warehouseName || product.warehouse || 'null'}`);
      });
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();