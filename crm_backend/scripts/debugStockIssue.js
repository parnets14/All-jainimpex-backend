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

const debugStockIssue = async () => {
  try {
    console.log('🔍 Debugging stock update issue...');
    
    // Check all orders
    const allOrders = await SalesOrder.find({})
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name')
      .sort({ orderNumber: 1 });
    
    console.log(`Found ${allOrders.length} total orders:`);
    
    allOrders.forEach((order, index) => {
      console.log(`\n${index + 1}. Order ${order.orderNumber}:`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Dealer: ${order.dealerName}`);
      console.log(`   Products: ${order.products.length}`);
      order.products.forEach((product, pIndex) => {
        console.log(`     Product ${pIndex + 1}: ${product.productName} (${product.productCode})`);
        console.log(`     Quantity: ${product.quantity}`);
        console.log(`     Warehouse: ${product.warehouseName || product.warehouse}`);
      });
    });
    
    // Check stock movements
    console.log('\n🔍 Checking stock movements...');
    const stockMovements = await StockMovement.find({})
      .populate('productId', 'itemName productCode')
      .populate('warehouseId', 'name')
      .sort({ date: -1 })
      .limit(10);
    
    console.log(`Found ${stockMovements.length} recent stock movements:`);
    stockMovements.forEach((movement, index) => {
      console.log(`\n${index + 1}. ${movement.type} - ${movement.quantity} units`);
      console.log(`   Product: ${movement.productId?.itemName}`);
      console.log(`   Warehouse: ${movement.warehouseId?.name}`);
      console.log(`   Balance: ${movement.balance}`);
      console.log(`   Reference: ${movement.referenceNo}`);
      console.log(`   Remarks: ${movement.remarks}`);
    });
    
    // Test creating a delivered order manually
    if (allOrders.length > 0) {
      console.log('\n🔍 Testing stock update for delivered order...');
      const testOrder = allOrders[0];
      console.log(`Testing with order: ${testOrder.orderNumber}`);
      
      // Simulate status change to Delivered
      const originalStatus = testOrder.status;
      console.log(`Original status: ${originalStatus}`);
      
      if (originalStatus === "Confirmed") {
        console.log('Order is confirmed, testing delivery...');
        
        for (const product of testOrder.products) {
          if (product.warehouse) {
            console.log(`Processing product: ${product.productName} in warehouse: ${product.warehouseName}`);
            
            // Get current balance
            const latestMovement = await StockMovement.findOne({
              productId: product.product,
              warehouseId: product.warehouse
            }).sort({ date: -1, createdAt: -1 });
            
            const currentBalance = latestMovement ? latestMovement.balance : 0;
            console.log(`Current balance: ${currentBalance}`);
            
            // Create delivery movement
            const deliveryMovement = new StockMovement({
              productId: product.product,
              warehouseId: product.warehouse,
              type: 'OUT',
              quantity: 0, // No quantity change, just tracking
              balance: currentBalance,
              referenceNo: testOrder.orderNumber,
              referenceType: 'SALE',
              date: new Date(),
              remarks: `Order ${testOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
              createdBy: testOrder.createdBy
            });
            
            await deliveryMovement.save();
            console.log(`✅ Created delivery movement for ${product.productName}`);
          }
        }
      } else {
        console.log(`Order status is ${originalStatus}, not confirmed. Cannot test delivery.`);
      }
    }
    
  } catch (error) {
    console.error('Error debugging stock issue:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  debugStockIssue();
});
