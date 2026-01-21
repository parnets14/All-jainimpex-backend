import mongoose from 'mongoose';
import StockAdjustment from './models/StockAdjustment.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';
import StockMovement from './models/Stock.js';
import { createStockAdjustment } from './controllers/stockAdjustmentController.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testCompleteStockAdjustment() {
  try {
    console.log('🧪 Testing Complete Stock Adjustment Flow...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');
    
    // Find or create test data
    let testWarehouse = await Warehouse.findOne().limit(1);
    let testProduct = await Product.findOne().limit(1);
    let testUser = await User.findOne().limit(1);
    
    if (!testWarehouse) {
      console.log('⚠️ No warehouse found in database');
      return;
    }
    
    if (!testProduct) {
      console.log('⚠️ No product found in database');
      return;
    }
    
    if (!testUser) {
      console.log('⚠️ No user found in database');
      return;
    }
    
    console.log('📦 Using test data:');
    console.log('- Warehouse:', testWarehouse.name);
    console.log('- Product:', testProduct.itemName);
    console.log('- User:', testUser.name);
    
    // Create mock request and response objects
    const mockReq = {
      body: {
        warehouseId: testWarehouse._id.toString(),
        adjustmentType: "ADD",
        reason: "Opening Stock",
        remarks: "Test adjustment for debugging",
        items: [
          {
            productId: testProduct._id.toString(),
            quantity: 10,
            unitPrice: testProduct.unitPrice || 100,
            remarks: "Test item"
          }
        ],
        createdBy: testUser._id.toString()
      },
      user: {
        _id: testUser._id
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
    
    console.log('\n🚀 Testing controller function...');
    
    // Test the controller function
    await createStockAdjustment(mockReq, mockRes);
    
    if (mockRes.statusCode === 201) {
      console.log('✅ Stock adjustment created successfully!');
      console.log('📋 Response:', mockRes.responseData);
      
      // Verify stock movement was created
      const stockMovements = await StockMovement.find({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      
      console.log(`📊 Created ${stockMovements.length} stock movement(s)`);
      
      // Clean up - delete test records
      await StockAdjustment.findByIdAndDelete(mockRes.responseData.data._id);
      await StockMovement.deleteMany({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      console.log('🧹 Test records cleaned up');
      
    } else {
      console.log('❌ Stock adjustment creation failed');
      console.log('Status:', mockRes.statusCode);
      console.log('Response:', mockRes.responseData);
    }
    
  } catch (error) {
    console.error('❌ Error testing complete stock adjustment:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testCompleteStockAdjustment();