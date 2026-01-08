import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';
import User from './models/User.js';

dotenv.config();

const testProductCreationDebug = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Product Creation Debug...\n');

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
    const pipeCategory = await Category.findOne({ name: 'pipe' });
    const pvcSubcategory = await Subcategory.findOne({ 
      name: 'pvc pipe', 
      category: pipeCategory._id 
    });

    // Find a brand that should only show for specific hierarchy
    const directBrand = await Brand.findOne({
      category: pipeCategory._id,
      subcategory: pvcSubcategory._id,
      subcategory1: null,
      subcategory2: null,
      subcategory3: null,
      subcategory4: null,
      subcategory5: null
    });

    const extendedBrand = await Brand.findOne({
      category: pipeCategory._id,
      subcategory: pvcSubcategory._id,
      subcategory1: { $ne: null }
    });

    console.log('📊 Found test data:');
    console.log(`   Category: ${pipeCategory?.name}`);
    console.log(`   Subcategory: ${pvcSubcategory?.name}`);
    console.log(`   Direct Brand: ${directBrand?.name || 'None found'}`);
    console.log(`   Extended Brand: ${extendedBrand?.name || 'None found'}`);

    if (!pipeCategory || !pvcSubcategory) {
      console.log('❌ Required test data not found');
      return;
    }

    // Test 1: Brand filtering for direct subcategory (no extended levels)
    console.log('\n🔍 Test 1: Brand filtering for direct subcategory (no extended levels)');
    
    const { getBrands } = await import('./controllers/brandController.js');
    
    const mockReq1 = {
      query: {
        category: pipeCategory._id.toString(),
        subcategory: pvcSubcategory._id.toString()
        // No extended subcategory parameters
      },
      user: testUser
    };

    const mockRes1 = {
      json: (data) => {
        console.log('📊 Direct subcategory brands:', {
          success: data.success,
          brandCount: data.brands?.length || 0,
          brands: data.brands?.map(b => ({
            name: b.name,
            hasExtended: !!(b.subcategory1 || b.subcategory2 || b.subcategory3 || b.subcategory4 || b.subcategory5)
          })) || []
        });
        
        const extendedBrandsFound = data.brands?.filter(b => 
          b.subcategory1 || b.subcategory2 || b.subcategory3 || b.subcategory4 || b.subcategory5
        ) || [];
        
        if (extendedBrandsFound.length > 0) {
          console.log('❌ ERROR: Found extended brands when filtering by direct subcategory');
          extendedBrandsFound.forEach(b => console.log(`   - ${b.name} (should not appear)`));
        } else {
          console.log('✅ SUCCESS: Only direct brands found');
        }
        
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ API Error ${code}:`, data);
          return data;
        }
      })
    };

    await getBrands(mockReq1, mockRes1);

    // Test 2: Product creation with missing unitPrice
    console.log('\n🔍 Test 2: Product creation validation');
    
    const { createProduct } = await import('./controllers/productController.js');
    
    // Test with missing unitPrice
    const mockReq2 = {
      body: {
        productCode: 'TEST001',
        HSNCode: '12345678',
        itemName: 'Test Product',
        description: 'Test product description',
        unit: 'piece',
        gst: 18,
        category: pipeCategory._id.toString(),
        subcategory: pvcSubcategory._id.toString(),
        brand: directBrand?._id?.toString() || 'dummy',
        minStockLevel: 10
        // Missing unitPrice intentionally
      },
      user: testUser
    };

    const mockRes2 = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Product creation response (${code}):`, {
            success: data.success,
            message: data.message
          });
          
          if (code === 400 && data.message?.includes('unitPrice')) {
            console.log('✅ SUCCESS: Proper validation error for missing unitPrice');
          } else if (code === 201) {
            console.log('❌ ERROR: Product created without unitPrice (should fail)');
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Product creation success:', data);
        return data;
      }
    };

    await createProduct(mockReq2, mockRes2);

    // Test 3: Product creation with valid data
    console.log('\n🔍 Test 3: Product creation with valid data');
    
    const mockReq3 = {
      body: {
        productCode: `TEST${Date.now()}`,
        HSNCode: '12345678',
        itemName: 'Test Product Valid',
        description: 'Test product with valid data',
        unit: 'piece',
        unitPrice: 100.50,
        gst: 18,
        category: pipeCategory._id.toString(),
        subcategory: pvcSubcategory._id.toString(),
        brand: directBrand?._id?.toString() || 'dummy',
        minStockLevel: 10,
        images: []
      },
      user: testUser
    };

    const mockRes3 = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Valid product creation response (${code}):`, {
            success: data.success,
            message: data.message,
            productId: data.product?._id
          });
          
          if (code === 201) {
            console.log('✅ SUCCESS: Product created with valid data');
            console.log(`   Product ID: ${data.product?._id}`);
            console.log(`   Unit Price: ₹${data.product?.unitPrice}`);
            console.log(`   Total Amount: ₹${data.product?.totalAmount}`);
          } else {
            console.log('❌ ERROR: Valid product creation failed');
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Valid product creation success:', data);
        return data;
      }
    };

    await createProduct(mockReq3, mockRes3);

    console.log('\n✅ Product Creation Debug Test Complete!');
    console.log('\n💡 Summary:');
    console.log('   1. Brand filtering should only show direct brands when no extended levels selected');
    console.log('   2. Product creation should fail without unitPrice');
    console.log('   3. Product creation should succeed with valid unitPrice');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testProductCreationDebug();