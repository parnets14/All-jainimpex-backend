import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testProductsApiResponse = async () => {
  try {
    console.log('🧪 Testing Products API response format...\n');

    // Simulate the products API call that frontend makes
    const products = await Product.find()
      .sort({ createdAt: -1 });

    console.log(`📦 Found ${products.length} products:`);
    
    products.forEach((product, index) => {
      console.log(`\n${index + 1}. Product: ${product.itemName}`);
      console.log(`   _id: ${product._id}`);
      console.log(`   productCode: ${product.productCode}`);
      console.log(`   itemName: ${product.itemName}`);
      
      // Check the field structure that frontend will receive
      console.log(`   brand: ${product.brand}`);
      console.log(`   category: ${product.category}`);
      console.log(`   subcategory: ${product.subcategory}`);
      
      // Check if these are ObjectIds or populated objects
      console.log(`   brand type: ${typeof product.brand}`);
      console.log(`   category type: ${typeof product.category}`);
      console.log(`   subcategory type: ${typeof product.subcategory}`);
      
      // Test toString() conversion
      if (product.brand) {
        console.log(`   brand.toString(): ${product.brand.toString()}`);
      }
      if (product.category) {
        console.log(`   category.toString(): ${product.category.toString()}`);
      }
      if (product.subcategory) {
        console.log(`   subcategory.toString(): ${product.subcategory.toString()}`);
      }
    });

    // Test the exact API response format
    console.log('\n📋 Simulating API response format:');
    const apiResponse = {
      success: true,
      products: products,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: products.length,
        itemsPerPage: 10,
      },
    };

    console.log('API Response structure:', {
      success: apiResponse.success,
      productsCount: apiResponse.products.length,
      pagination: apiResponse.pagination
    });

    // Check what the frontend will actually receive
    console.log('\n🔍 Frontend will receive these product objects:');
    products.forEach((product, index) => {
      const frontendProduct = {
        _id: product._id,
        itemName: product.itemName,
        productCode: product.productCode,
        brand: product.brand,
        category: product.category,
        subcategory: product.subcategory
      };
      
      console.log(`   ${index + 1}. Frontend product:`, frontendProduct);
    });

  } catch (error) {
    console.error('❌ Error testing products API response:', error);
  }
};

const main = async () => {
  await connectDB();
  await testProductsApiResponse();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);