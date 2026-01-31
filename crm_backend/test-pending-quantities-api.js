import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

dotenv.config();

const testPendingQuantitiesAPI = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Simulate the getPendingQuantities API logic
    console.log('🔍 Testing getPendingQuantities API logic...\n');
    
    // Build query for out-of-stock orders that are still pending
    const query = {
      isOutOfStock: true,
      status: "Pending"
    };
    
    console.log('📋 Query:', JSON.stringify(query, null, 2));
    
    // Get all out-of-stock pending orders (without populate to avoid schema issues)
    const outOfStockOrders = await SalesOrder.find(query).lean();
    
    console.log(`📊 Found ${outOfStockOrders.length} out-of-stock pending orders`);
    
    // Aggregate pending quantities by product and warehouse
    const pendingQuantities = {};

    outOfStockOrders.forEach(order => {
      console.log(`\n🔍 Processing order: ${order.orderNumber}`);
      order.products.forEach(product => {
        const productKey = `${product.product}-${product.warehouse}`;
        console.log(`   - Product: ${product.productName}, Quantity: ${product.quantity}, Warehouse: ${product.warehouseName}`);
        
        if (!pendingQuantities[productKey]) {
          pendingQuantities[productKey] = {
            productId: product.product,
            productName: product.productName,
            productCode: product.productCode,
            warehouseId: product.warehouse,
            warehouseName: product.warehouseName,
            totalPendingQuantity: 0,
            orders: []
          };
        }
        
        pendingQuantities[productKey].totalPendingQuantity += product.quantity;
        pendingQuantities[productKey].orders.push({
          orderNumber: order.orderNumber,
          dealerName: order.dealerName,
          quantity: product.quantity,
          orderDate: order.orderDate,
          dueDate: order.dueDate
        });
      });
    });

    // Convert to array format
    const pendingQuantitiesArray = Object.values(pendingQuantities);
    
    console.log('\n📊 Final Results:');
    console.log(`   - Total out-of-stock orders: ${outOfStockOrders.length}`);
    console.log(`   - Total products with pending quantities: ${pendingQuantitiesArray.length}`);
    console.log(`   - Total pending quantity: ${pendingQuantitiesArray.reduce((sum, item) => sum + item.totalPendingQuantity, 0)}`);
    
    console.log('\n📋 Pending Quantities Details:');
    pendingQuantitiesArray.forEach(item => {
      console.log(`   - ${item.productName} (${item.productCode}): ${item.totalPendingQuantity} units`);
      console.log(`     Warehouse: ${item.warehouseName || 'No Warehouse'}`);
      console.log(`     Orders: ${item.orders.length}`);
    });
    
    // Test the API response format
    const apiResponse = {
      success: true,
      pendingQuantities: pendingQuantitiesArray,
      totalOutOfStockOrders: outOfStockOrders.length,
      summary: {
        totalProducts: pendingQuantitiesArray.length,
        totalPendingQuantity: pendingQuantitiesArray.reduce((sum, item) => sum + item.totalPendingQuantity, 0)
      }
    };
    
    console.log('\n🚀 API Response:');
    console.log(JSON.stringify(apiResponse, null, 2));
    
    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testPendingQuantitiesAPI();