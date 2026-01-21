import mongoose from 'mongoose';
import StockAdjustment from './models/StockAdjustment.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';
import Region from './models/Region.js';
import StockMovement from './models/Stock.js';
import { createStockAdjustment } from './controllers/stockAdjustmentController.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testStockAdjustmentRealData() {
  try {
    console.log('🧪 Testing Stock Adjustment with Real Database Data...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get real data from database
    const warehouse = await Warehouse.findOne().populate('region').populate('createdBy');
    const product = await Product.findOne();
    const user = await User.findOne();
    
    console.log('📦 Using real data:');
    console.log('- Warehouse:', warehouse.name, `(${warehouse._id})`);
    console.log('- Product:', product.itemName, `(${product._id})`);
    console.log('- User:', user.name, `(${user._id})`);
    
    // Create mock request and response objects
    const mockReq = {
      body: {
        warehouseId: warehouse._id.toString(),
        adjustmentType: "ADD",
        reason: "Opening Stock",
        remarks: "Test adjustment for debugging - using real data",
        items: [
          {
            productId: product._id.toString(),
            quantity: 5,
            unitPrice: product.unitPrice || 100,
            remarks: "Test item with real product"
          }
        ],
        createdBy: user._id.toString()
      },
      user: {
        _id: user._id
      }
    };
    
    const mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.responseData = data;
        return this;
      }
    };
    
    console.log('\n🚀 Testing createStockAdjustment controller...');
    
    // Test the controller function
    await createStockAdjustment(mockReq, mockRes);
    
    if (mockRes.statusCode === 201) {
      console.log('✅ Stock adjustment created successfully!');
      console.log('📋 Response Details:');
      console.log('  - Adjustment No:', mockRes.responseData.data.adjustmentNo);
      console.log('  - Total Items:', mockRes.responseData.data.totalItems);
      console.log('  - Total Quantity:', mockRes.responseData.data.totalQuantity);
      console.log('  - Total Value:', mockRes.responseData.data.totalValue);
      console.log('  - Status:', mockRes.responseData.data.status);
      
      // Verify stock movement was created
      const stockMovements = await StockMovement.find({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      
      console.log(`\n📊 Created ${stockMovements.length} stock movement(s):`);
      stockMovements.forEach((movement, index) => {
        console.log(`  ${index + 1}. Type: ${movement.type}, Quantity: ${movement.quantity}, Balance: ${movement.balance}, Date: ${movement.date}`);
      });
      
      // Test GET operations
      console.log('\n🔍 Testing GET operations...');
      
      // Test getting all adjustments
      const mockGetReq = { query: {} };
      const mockGetRes = {
        status: function(code) { this.statusCode = code; return this; },
        json: function(data) { this.responseData = data; return this; }
      };
      
      const { getStockAdjustments } = await import('./controllers/stockAdjustmentController.js');
      await getStockAdjustments(mockGetReq, mockGetRes);
      
      if (mockGetRes.statusCode === 200) {
        console.log('✅ GET adjustments successful');
        console.log(`  - Found ${mockGetRes.responseData.data?.length || 0} adjustments`);
      } else {
        console.log('❌ GET adjustments failed:', mockGetRes.responseData);
      }
      
      // Clean up - delete test records
      await StockAdjustment.findByIdAndDelete(mockRes.responseData.data._id);
      await StockMovement.deleteMany({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      console.log('\n🧹 Test records cleaned up');
      
    } else {
      console.log('❌ Stock adjustment creation failed');
      console.log('Status:', mockRes.statusCode);
      console.log('Response:', mockRes.responseData);
    }
    
  } catch (error) {
    console.error('❌ Error testing stock adjustment:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testStockAdjustmentRealData();