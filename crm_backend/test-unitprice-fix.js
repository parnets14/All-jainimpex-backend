import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testUnitPriceFix = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Unit Price Fix...\n');

    // Find existing test user
    let testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        phone: '1234567890',
        role: 'super_admin'
      });
    }

    // Find real data
    const category = await Category.findOne();
    const subcategory = await Subcategory.findOne({ category: category._id });
    const brand = await Brand.findOne({ 
      category: category._id, 
      subcategory: subcategory._id 
    });

    console.log('📊 Found test data:');
    console.log(`   Category: ${category?.name}`);
    console.log(`   Subcategory: ${subcategory?.name}`);
    console.log(`   Brand: ${brand?.name}`);

    if (!category || !subcategory || !brand) {
      console.log('❌ Required test data not found');
      return;
    }

    // Test the createProduct controller directly
    const { createProduct } = await import('./controllers/productController.js');

    console.log('\n🔍 Test 1: Product creation with missing unitPrice');
    
    const mockReq1 = {
      body: {
        productCode: `TEST${Date.now()}`,
        HSNCode: '12345678',
        itemName: 'Test Product No Price',
        description: 'Test product without unitPrice',
        unit: 'piece',
        gst: 18,
        category: category._id.toString(),
        subcategory: subcategory._id.toString(),
        brand: brand._id.toString(),
        minStockLevel: 10
        // Missing unitPrice intentionally
      },
      user: testUser
    };

    const mockRes1 = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Response (${code}):`, {
            success: data.success,
            message: data.message
          });
          
          if (code === 400 || (data.message && data.message.includes('unitPrice'))) {
            console.log('✅ SUCCESS: Proper validation for missing unitPrice');
          } else {
            console.log('❌ ERROR: Should have failed due to missing unitPrice');
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Unexpected success response:', data);
        return data;
      }
    };

    await createProduct(mockReq1, mockRes1);

    console.log('\n🔍 Test 2: Product creation with valid unitPrice');
    
    const mockReq2 = {
      body: {
        productCode: `TEST${Date.now()}`,
        HSNCode: '87654321',
        itemName: 'Test Product With Price',
        description: 'Test product with valid unitPrice',
        unit: 'piece',
        unitPrice: 150.75,
        gst: 18,
        category: category._id.toString(),
        subcategory: subcategory._id.toString(),
        brand: brand._id.toString(),
        minStockLevel: 5,
        images: []
      },
      user: testUser
    };

    const mockRes2 = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Response (${code}):`, {
            success: data.success,
            message: data.message,
            productId: data.product?._id,
            unitPrice: data.product?.unitPrice,
            totalAmount: data.product?.totalAmount
          });
          
          if (code === 201 && data.success) {
            console.log('✅ SUCCESS: Product created with valid unitPrice');
            console.log(`   Unit Price: ₹${data.product?.unitPrice}`);
            console.log(`   Total with GST: ₹${data.product?.totalAmount}`);
          } else {
            console.log('❌ ERROR: Valid product creation failed');
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Success response:', data);
        return data;
      }
    };

    await createProduct(mockReq2, mockRes2);

    console.log('\n✅ Unit Price Fix Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testUnitPriceFix();