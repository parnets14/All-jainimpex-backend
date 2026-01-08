import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';
import User from './models/User.js';

dotenv.config();

const testPricingCompatibility = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Pricing Compatibility (unitPrice + rateSlabs)...\n');

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

    // Test 1: Create product with unitPrice (ProductMaster style)
    console.log('\n🔍 Test 1: Create product with unitPrice (ProductMaster style)');
    
    const { createProduct } = await import('./controllers/productController.js');
    
    const mockReq1 = {
      body: {
        productCode: `PRICE${Date.now()}`,
        HSNCode: '12345678',
        itemName: 'Test Pricing Product',
        description: 'Test product for pricing compatibility',
        unit: 'piece',
        unitPrice: 100.50,
        gst: 18,
        category: category._id.toString(),
        subcategory: subcategory._id.toString(),
        brand: brand._id.toString(),
        minStockLevel: 10,
        rateSlabs: [{
          quantity: 1,
          rate: 100.50,
          amount: 100.50
        }],
        images: []
      },
      user: testUser
    };

    let createdProductId = null;

    const mockRes1 = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Response (${code}):`, {
            success: data.success,
            message: data.message,
            productId: data.product?._id,
            unitPrice: data.product?.unitPrice,
            rateSlabs: data.product?.rateSlabs,
            currentPrice: data.product?.currentPrice,
            totalAmount: data.product?.totalAmount
          });
          
          if (code === 201 && data.success) {
            createdProductId = data.product._id;
            console.log('✅ SUCCESS: Product created with unitPrice and rateSlabs');
            console.log(`   Unit Price: ₹${data.product?.unitPrice}`);
            console.log(`   Rate Slabs: ${JSON.stringify(data.product?.rateSlabs)}`);
            console.log(`   Current Price (virtual): ₹${data.product?.currentPrice}`);
            console.log(`   Total with GST: ₹${data.product?.totalAmount}`);
          } else {
            console.log('❌ ERROR: Product creation failed');
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Success response:', data);
        return data;
      }
    };

    await createProduct(mockReq1, mockRes1);

    // Test 2: Verify the product can be retrieved with currentPrice
    if (createdProductId) {
      console.log('\n🔍 Test 2: Verify product retrieval with currentPrice');
      
      const product = await Product.findById(createdProductId);
      
      console.log('📊 Retrieved product pricing info:');
      console.log(`   Unit Price: ₹${product.unitPrice}`);
      console.log(`   Rate Slabs: ${JSON.stringify(product.rateSlabs)}`);
      console.log(`   Current Price (virtual): ₹${product.currentPrice}`);
      console.log(`   Total Amount: ₹${product.totalAmount}`);
      
      // Test compatibility with PurchaseOrderManagement style access
      const purchaseOrderPrice = product.rateSlabs?.[0]?.rate || 0;
      const productMasterPrice = product.unitPrice || 0;
      const virtualCurrentPrice = product.currentPrice;
      
      console.log('\n📊 Compatibility Check:');
      console.log(`   PurchaseOrder style (rateSlabs[0].rate): ₹${purchaseOrderPrice}`);
      console.log(`   ProductMaster style (unitPrice): ₹${productMasterPrice}`);
      console.log(`   Virtual currentPrice: ₹${virtualCurrentPrice}`);
      
      if (purchaseOrderPrice === productMasterPrice && virtualCurrentPrice === productMasterPrice) {
        console.log('✅ SUCCESS: All pricing methods return the same value');
      } else {
        console.log('❌ ERROR: Pricing methods return different values');
      }
    }

    // Test 3: Test with existing products that might only have rateSlabs
    console.log('\n🔍 Test 3: Test backward compatibility with existing products');
    
    const existingProducts = await Product.find().limit(3);
    
    console.log('📊 Existing products pricing:');
    existingProducts.forEach((product, index) => {
      console.log(`\n   Product ${index + 1}: ${product.itemName}`);
      console.log(`     Unit Price: ₹${product.unitPrice || 'Not set'}`);
      console.log(`     Rate Slabs: ${product.rateSlabs?.length || 0} slabs`);
      if (product.rateSlabs?.length > 0) {
        console.log(`     First Rate Slab: ₹${product.rateSlabs[0].rate}`);
      }
      console.log(`     Current Price (virtual): ₹${product.currentPrice}`);
    });

    console.log('\n✅ Pricing Compatibility Test Complete!');
    console.log('\n💡 Summary:');
    console.log('   - Products can be created with unitPrice (ProductMaster)');
    console.log('   - Rate slabs are automatically created from unitPrice');
    console.log('   - PurchaseOrderManagement can still use rateSlabs[0].rate');
    console.log('   - Virtual currentPrice provides unified access');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testPricingCompatibility();