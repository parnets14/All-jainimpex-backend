import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Stock from './models/Stock.js';

dotenv.config();

const debugStockKeys = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // 1. Check the pending quantities API response
    console.log('🔍 Testing pending quantities API...\n');
    
    const query = {
      isOutOfStock: true,
      status: "Pending"
    };
    
    const outOfStockOrders = await SalesOrder.find(query).lean();
    console.log(`📊 Found ${outOfStockOrders.length} out-of-stock orders`);
    
    const pendingQuantities = {};
    outOfStockOrders.forEach(order => {
      order.products.forEach(product => {
        const productKey = `${product.product}-${product.warehouse}`;
        console.log(`🔑 Backend Key: "${productKey}"`);
        console.log(`   - Product ID: ${product.product}`);
        console.log(`   - Warehouse ID: ${product.warehouse}`);
        console.log(`   - Warehouse Name: ${product.warehouseName}`);
        
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
      });
    });
    
    console.log('\n📋 Pending Quantities Map:');
    Object.entries(pendingQuantities).forEach(([key, value]) => {
      console.log(`   Key: "${key}" -> Quantity: ${value.totalPendingQuantity}`);
    });
    
    // 2. Check stock data to see what keys the frontend would generate
    console.log('\n🔍 Checking stock data...\n');
    
    const stockData = await Stock.find().lean();
    console.log(`📊 Found ${stockData.length} stock entries`);
    
    stockData.forEach(stock => {
      const frontendKey = `${stock.productId}-${stock.warehouseId}`;
      console.log(`🔑 Frontend Key: "${frontendKey}"`);
      console.log(`   - Product ID: ${stock.productId}`);
      console.log(`   - Warehouse ID: ${stock.warehouseId}`);
      
      // Check if this key exists in pending quantities
      const hasPending = pendingQuantities[frontendKey];
      console.log(`   - Has Pending: ${hasPending ? 'YES (' + hasPending.totalPendingQuantity + ')' : 'NO'}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

debugStockKeys();