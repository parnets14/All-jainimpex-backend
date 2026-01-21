import mongoose from 'mongoose';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import StockMovement from './models/Stock.js';
import StockAdjustment from './models/StockAdjustment.js';
import StockMovementService from './services/stockMovementService.js';
import { getStock } from './controllers/stockController.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugStockWithAdjustments() {
  try {
    console.log('🔍 Debugging Stock with Manual Adjustments...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get a product and warehouse that has manual adjustments
    const adjustment = await StockAdjustment.findOne().populate('warehouseId').populate('items.productId');
    
    if (!adjustment) {
      console.log('❌ No manual adjustments found in database');
      return;
    }
    
    console.log('📋 Found adjustment:', adjustment.adjustmentNo);
    console.log('📦 Warehouse:', adjustment.warehouseId.name);
    console.log('📦 Items:', adjustment.items.length);
    
    const firstItem = adjustment.items[0];
    const productId = firstItem.productId._id;
    const warehouseId = adjustment.warehouseId._id;
    
    console.log('\n🔍 Checking stock movements for this product/warehouse...');
    
    // Get all stock movements for this product/warehouse
    const movements = await StockMovement.find({
      productId: productId,
      warehouseId: warehouseId
    }).sort({ date: 1, createdAt: 1 });
    
    console.log(`📊 Found ${movements.length} stock movements:`);
    movements.forEach((movement, index) => {
      console.log(`  ${index + 1}. ${movement.type} | Qty: ${movement.quantity} | Balance: ${movement.balance} | Ref: ${movement.referenceType} | Date: ${movement.date.toLocaleDateString()}`);
    });
    
    // Get current stock using service
    const currentStock = await StockMovementService.getCurrentStock(productId, warehouseId);
    console.log(`\n📊 Current stock from service: ${currentStock}`);
    
    // Test the stock API
    console.log('\n🚀 Testing Stock API...');
    
    const mockReq = {
      query: {
        page: 1,
        limit: 10,
        warehouseId: warehouseId.toString()
      }
    };
    
    const mockRes = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.responseData = data; return this; }
    };
    
    await getStock(mockReq, mockRes);
    
    if (mockRes.statusCode === 200) {
      console.log('✅ Stock API successful');
      const stockData = mockRes.responseData.data;
      
      // Find our product in the results
      const productStock = stockData.find(stock => 
        stock.productId === productId.toString() && 
        stock.warehouseId === warehouseId.toString()
      );
      
      if (productStock) {
        console.log('📦 Product found in stock API:');
        console.log('  - Product:', productStock.itemName);
        console.log('  - Current Stock:', productStock.currentStock);
        console.log('  - Total Qty (from GRN):', productStock.totalQty);
        console.log('  - Warehouse:', productStock.warehouseName);
      } else {
        console.log('❌ Product not found in stock API results');
        console.log('Available products in results:');
        stockData.forEach((stock, index) => {
          console.log(`  ${index + 1}. ${stock.itemName} (${stock.productId}) - Stock: ${stock.currentStock}`);
        });
      }
    } else {
      console.log('❌ Stock API failed:', mockRes.responseData);
    }
    
    // Check if there are any issues with stock movement balance calculation
    console.log('\n🔍 Verifying balance calculation...');
    let runningBalance = 0;
    movements.forEach((movement, index) => {
      if (movement.type === 'IN') {
        runningBalance += movement.quantity;
      } else if (movement.type === 'OUT') {
        runningBalance -= movement.quantity;
      }
      
      if (movement.balance !== runningBalance) {
        console.log(`⚠️ Balance mismatch at movement ${index + 1}: Expected ${runningBalance}, Got ${movement.balance}`);
      }
    });
    
    console.log(`✅ Final calculated balance: ${runningBalance}`);
    
  } catch (error) {
    console.error('❌ Error debugging stock:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugStockWithAdjustments();