import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';
import StockMovement from '../models/Stock.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkDeliveredOrders = async () => {
  try {
    console.log('🔍 Checking delivered orders...');
    
    const deliveredOrders = await SalesOrder.find({ status: 'Delivered' })
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name');
    
    console.log(`Found ${deliveredOrders.length} delivered orders:`);
    
    deliveredOrders.forEach((order, index) => {
      console.log(`\n${index + 1}. Order ${order.orderNumber}:`);
      order.products.forEach((product, pIndex) => {
        console.log(`   Product ${pIndex + 1}: ${product.productName} (${product.productCode})`);
        console.log(`   Quantity: ${product.quantity}`);
        console.log(`   Warehouse: ${product.warehouseName || product.warehouse}`);
      });
    });
    
    // Check stock movements for these orders
    console.log('\n🔍 Checking stock movements for delivered orders...');
    for (const order of deliveredOrders) {
      const movements = await StockMovement.find({
        referenceNo: order.orderNumber,
        referenceType: 'SALE'
      }).populate('productId', 'itemName productCode')
        .populate('warehouseId', 'name');
      
      console.log(`\nStock movements for ${order.orderNumber}:`);
      movements.forEach((movement, index) => {
        console.log(`  ${index + 1}. ${movement.type} - ${movement.quantity} units`);
        console.log(`     Product: ${movement.productId?.itemName}`);
        console.log(`     Warehouse: ${movement.warehouseId?.name}`);
        console.log(`     Balance: ${movement.balance}`);
        console.log(`     Remarks: ${movement.remarks}`);
      });
    }
    
  } catch (error) {
    console.error('Error checking delivered orders:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  checkDeliveredOrders();
});
