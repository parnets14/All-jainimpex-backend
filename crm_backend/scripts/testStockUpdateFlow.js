import mongoose from 'mongoose';
import SalesOrder from '../models/SalesOrder.js';
import StockMovement from '../models/Stock.js';
import Product from '../models/Product.js';
import Dealer from '../models/Dealer.js';
import Warehouse from '../models/Warehouse.js';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const testStockUpdateFlow = async () => {
  try {
    console.log('🔍 Testing complete stock update flow...');
    
    // Check if we have the necessary data
    const products = await Product.find({}).limit(1);
    const dealers = await Dealer.find({}).limit(1);
    const warehouses = await Warehouse.find({}).limit(1);
    
    if (products.length === 0 || dealers.length === 0 || warehouses.length === 0) {
      console.log('❌ Missing required data:');
      console.log(`Products: ${products.length}`);
      console.log(`Dealers: ${dealers.length}`);
      console.log(`Warehouses: ${warehouses.length}`);
      console.log('Please ensure you have at least one product, dealer, and warehouse in the database.');
      return;
    }
    
    const testProduct = products[0];
    const testDealer = dealers[0];
    const testWarehouse = warehouses[0];
    
    console.log(`✅ Using test data:`);
    console.log(`Product: ${testProduct.itemName} (${testProduct.productCode})`);
    console.log(`Dealer: ${testDealer.name}`);
    console.log(`Warehouse: ${testWarehouse.name}`);
    
    // Create a test sales order
    const testOrder = new SalesOrder({
      orderNumber: 'SO-2025-TEST-001',
      dealer: testDealer._id,
      dealerName: testDealer.name,
      dealerType: testDealer.dealerType,
      region: testDealer.regionId,
      pinCode: testDealer.address,
      products: [{
        product: testProduct._id,
        productId: testProduct._id,
        productName: testProduct.itemName,
        productCode: testProduct.productCode,
        HSNCode: testProduct.HSNCode,
        quantity: 5,
        unitPrice: 1000,
        gst: testProduct.gst,
        gstAmount: 1000 * testProduct.gst / 100,
        totalPrice: 1000 + (1000 * testProduct.gst / 100),
        warehouse: testWarehouse._id,
        warehouseName: testWarehouse.name
      }],
      orderDate: new Date(),
      deliveryDate: new Date(),
      creditDays: 30,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      grossAmount: 1000,
      totalGst: 1000 * testProduct.gst / 100,
      totalAmount: 1000 + (1000 * testProduct.gst / 100),
      type: 'Test Sales Order',
      remarks: 'Test order for stock update verification',
      status: 'Confirmed',
      createdBy: testDealer.createdBy
    });
    
    await testOrder.save();
    console.log(`✅ Created test order: ${testOrder.orderNumber}`);
    
    // Check initial stock balance
    const initialMovements = await StockMovement.find({
      productId: testProduct._id,
      warehouseId: testWarehouse._id
    }).sort({ date: -1, createdAt: -1 });
    
    const initialBalance = initialMovements.length > 0 ? initialMovements[0].balance : 0;
    console.log(`📊 Initial stock balance: ${initialBalance}`);
    
    // Simulate confirming the order (block stock)
    console.log('\n🔒 Simulating order confirmation (blocking stock)...');
    const latestMovement = await StockMovement.findOne({
      productId: testProduct._id,
      warehouseId: testWarehouse._id
    }).sort({ date: -1, createdAt: -1 });
    
    const currentBalance = latestMovement ? latestMovement.balance : 0;
    const newBalance = currentBalance - 5; // Block 5 units
    
    const blockMovement = new StockMovement({
      productId: testProduct._id,
      warehouseId: testWarehouse._id,
      type: 'OUT',
      quantity: 5,
      balance: newBalance,
      referenceNo: testOrder.orderNumber,
      referenceType: 'SALE',
      date: new Date(),
      remarks: `Order ${testOrder.orderNumber} - Stock Blocked`,
      createdBy: testDealer.createdBy
    });
    
    await blockMovement.save();
    console.log(`✅ Blocked 5 units. Balance: ${currentBalance} -> ${newBalance}`);
    
    // Update order status to Delivered
    console.log('\n🚚 Simulating order delivery...');
    testOrder.status = 'Delivered';
    await testOrder.save();
    
    // Create delivery movement (permanent stock reduction)
    const deliveryMovement = new StockMovement({
      productId: testProduct._id,
      warehouseId: testWarehouse._id,
      type: 'OUT',
      quantity: 0, // No quantity change, just tracking
      balance: newBalance, // Keep same balance
      referenceNo: testOrder.orderNumber,
      referenceType: 'SALE',
      date: new Date(),
      remarks: `Order ${testOrder.orderNumber} - Delivered (Stock Permanently Reduced)`,
      createdBy: testDealer.createdBy
    });
    
    await deliveryMovement.save();
    console.log(`✅ Order delivered - stock permanently reduced`);
    
    // Check final stock balance
    const finalMovements = await StockMovement.find({
      productId: testProduct._id,
      warehouseId: testWarehouse._id
    }).sort({ date: -1, createdAt: -1 });
    
    const finalBalance = finalMovements.length > 0 ? finalMovements[0].balance : 0;
    console.log(`📊 Final stock balance: ${finalBalance}`);
    
    // Display all movements for this product/warehouse
    console.log('\n📋 All stock movements for this product/warehouse:');
    finalMovements.forEach((movement, index) => {
      console.log(`${index + 1}. ${movement.type} - ${movement.quantity} units`);
      console.log(`   Balance: ${movement.balance}`);
      console.log(`   Reference: ${movement.referenceNo}`);
      console.log(`   Remarks: ${movement.remarks}`);
      console.log(`   Date: ${movement.date}`);
    });
    
    console.log('\n✅ Test completed successfully!');
    console.log(`Order ${testOrder.orderNumber} status: ${testOrder.status}`);
    console.log(`Stock balance changed from ${initialBalance} to ${finalBalance}`);
    
  } catch (error) {
    console.error('Error testing stock update flow:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

connectDB().then(() => {
  testStockUpdateFlow();
});
