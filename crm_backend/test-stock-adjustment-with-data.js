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

async function testStockAdjustmentWithData() {
  try {
    console.log('🧪 Testing Stock Adjustment with Test Data...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jain_impex_crm');
    console.log('✅ Connected to MongoDB');
    
    // Create test warehouse
    const testWarehouse = new Warehouse({
      name: 'Test Warehouse',
      code: 'TW001',
      address: {
        street: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        country: 'India'
      },
      contact: {
        phone: '1234567890',
        email: 'test@warehouse.com'
      },
      capacity: {
        totalArea: 1000,
        usedArea: 0
      },
      status: 'Active'
    });
    
    await testWarehouse.save();
    console.log('📦 Created test warehouse:', testWarehouse.name);
    
    // Create test product
    const testProduct = new Product({
      productCode: 'TEST001',
      itemName: 'Test Product',
      HSNCode: '1234',
      unitPrice: 100,
      gst: 18,
      description: 'Test product for stock adjustment'
    });
    
    await testProduct.save();
    console.log('📦 Created test product:', testProduct.itemName);
    
    // Create test user
    const testUser = new User({
      name: 'Test User',
      email: 'test@user.com',
      password: 'password123',
      role: 'admin',
      isActive: true
    });
    
    await testUser.save();
    console.log('👤 Created test user:', testUser.name);
    
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
            unitPrice: testProduct.unitPrice,
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
      console.log('📋 Adjustment No:', mockRes.responseData.data.adjustmentNo);
      console.log('📋 Total Items:', mockRes.responseData.data.totalItems);
      console.log('📋 Total Quantity:', mockRes.responseData.data.totalQuantity);
      console.log('📋 Total Value:', mockRes.responseData.data.totalValue);
      
      // Verify stock movement was created
      const stockMovements = await StockMovement.find({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      
      console.log(`📊 Created ${stockMovements.length} stock movement(s)`);
      if (stockMovements.length > 0) {
        console.log('📊 Stock Movement Details:');
        stockMovements.forEach((movement, index) => {
          console.log(`  ${index + 1}. Type: ${movement.type}, Quantity: ${movement.quantity}, Balance: ${movement.balance}`);
        });
      }
      
      // Clean up - delete test records
      await StockAdjustment.findByIdAndDelete(mockRes.responseData.data._id);
      await StockMovement.deleteMany({
        referenceNo: mockRes.responseData.data.adjustmentNo,
        referenceType: 'ADJUSTMENT'
      });
      console.log('🧹 Stock adjustment and movements cleaned up');
      
    } else {
      console.log('❌ Stock adjustment creation failed');
      console.log('Status:', mockRes.statusCode);
      console.log('Response:', mockRes.responseData);
    }
    
    // Clean up test data
    await Warehouse.findByIdAndDelete(testWarehouse._id);
    await Product.findByIdAndDelete(testProduct._id);
    await User.findByIdAndDelete(testUser._id);
    console.log('🧹 Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Error testing stock adjustment:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testStockAdjustmentWithData();