import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkAllOrders = async () => {
  try {
    console.log('🔍 Checking all sales orders...');
    
    const allOrders = await SalesOrder.find({})
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name')
      .sort({ orderNumber: 1 });
    
    console.log(`Found ${allOrders.length} total orders:`);
    
    allOrders.forEach((order, index) => {
      console.log(`\n${index + 1}. Order ${order.orderNumber}:`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Dealer: ${order.dealerName}`);
      console.log(`   Order Date: ${order.orderDate}`);
      console.log(`   Products: ${order.products.length}`);
      order.products.forEach((product, pIndex) => {
        console.log(`     Product ${pIndex + 1}: ${product.productName} (${product.productCode})`);
        console.log(`     Quantity: ${product.quantity}`);
        console.log(`     Warehouse: ${product.warehouseName || product.warehouse}`);
      });
    });
    
  } catch (error) {
    console.error('Error checking orders:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  checkAllOrders();
});
