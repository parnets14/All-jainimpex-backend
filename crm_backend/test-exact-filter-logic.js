import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';

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

const testExactFilterLogic = async () => {
  try {
    console.log('🧪 Testing exact filter logic that frontend uses...\n');

    // Get products (same as frontend)
    const products = await Product.find().sort({ createdAt: -1 });
    console.log(`📦 Total products: ${products.length}`);

    // Get "first category" (same as what user selected)
    const firstCategory = await Category.findOne({ name: 'first category' });
    console.log(`📁 First category: ${firstCategory.name} (ID: ${firstCategory._id})`);

    // Simulate frontend filter logic exactly
    const selectedModalCategory = firstCategory._id.toString();
    console.log(`🎯 Selected category ID (as string): ${selectedModalCategory}`);

    console.log('\n🔍 Testing filter logic for each product:');
    
    const filteredProducts = products.filter(product => {
      const productCategoryString = product.category ? product.category.toString() : null;
      const matches = product.category && product.category.toString() === selectedModalCategory;
      
      console.log(`   Product: ${product.itemName}`);
      console.log(`     category: ${product.category}`);
      console.log(`     category.toString(): ${productCategoryString}`);
      console.log(`     selectedModalCategory: ${selectedModalCategory}`);
      console.log(`     matches: ${matches}`);
      console.log('');
      
      return matches;
    });

    console.log(`✅ Filter result: ${filteredProducts.length} products match`);
    filteredProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.itemName}`);
    });

    // Also test with the exact comparison logic
    console.log('\n🔬 Testing with different comparison methods:');
    
    products.forEach(product => {
      console.log(`\nProduct: ${product.itemName}`);
      
      // Method 1: Direct ObjectId comparison
      const method1 = product.category && product.category.equals(firstCategory._id);
      console.log(`   Method 1 (ObjectId.equals): ${method1}`);
      
      // Method 2: String comparison (what frontend uses)
      const method2 = product.category && product.category.toString() === firstCategory._id.toString();
      console.log(`   Method 2 (toString comparison): ${method2}`);
      
      // Method 3: Direct comparison
      const method3 = product.category && product.category.toString() === selectedModalCategory;
      console.log(`   Method 3 (frontend logic): ${method3}`);
    });

  } catch (error) {
    console.error('❌ Error testing exact filter logic:', error);
  }
};

const main = async () => {
  await connectDB();
  await testExactFilterLogic();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);