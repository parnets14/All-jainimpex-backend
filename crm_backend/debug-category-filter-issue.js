import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Brand from './models/Brand.js';
import Subcategory from './models/Subcategory.js';

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

const debugCategoryFilterIssue = async () => {
  try {
    console.log('🔍 Debugging category filter issue...\n');

    // Find the "first category" that user selected
    const firstCategory = await Category.findOne({ name: 'first category' });
    console.log('📁 First Category:', firstCategory);

    if (!firstCategory) {
      console.log('❌ "first category" not found in database');
      return;
    }

    // Check products that should match this category
    console.log('\n🔍 Checking products with this category...');
    
    // Method 1: Direct category field match
    const productsWithCategory = await Product.find({ category: firstCategory._id });
    console.log(`📦 Products with category field matching: ${productsWithCategory.length}`);
    
    productsWithCategory.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.itemName} (category: ${product.category})`);
    });

    // Method 2: Check all products and their category fields
    console.log('\n📊 All products and their categories:');
    const allProducts = await Product.find();
    console.log(`📦 Total products in database: ${allProducts.length}`);
    
    allProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.itemName}`);
      console.log(`      category: ${product.category} (type: ${typeof product.category})`);
      console.log(`      brand: ${product.brand} (type: ${typeof product.brand})`);
      console.log(`      subcategory: ${product.subcategory} (type: ${typeof product.subcategory})`);
      
      // Check if this product's category matches the selected category
      const matches = product.category && product.category.toString() === firstCategory._id.toString();
      console.log(`      matches "first category": ${matches}`);
      console.log('');
    });

    // Method 3: Test the exact filter logic from frontend
    console.log('\n🧪 Testing frontend filter logic...');
    const selectedModalCategory = firstCategory._id.toString();
    console.log(`Selected category ID: ${selectedModalCategory}`);
    
    const filteredProducts = allProducts.filter(product => {
      const matches = product.category && product.category.toString() === selectedModalCategory;
      console.log(`   Product "${product.itemName}": category=${product.category}, matches=${matches}`);
      return matches;
    });
    
    console.log(`\n✅ Frontend filter logic result: ${filteredProducts.length} products`);
    filteredProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.itemName}`);
    });

    // Method 4: Check category hierarchy
    console.log('\n🏗️ Category hierarchy check...');
    const categoryWithBrand = await Category.findById(firstCategory._id).populate('brand');
    console.log('Category with brand:', categoryWithBrand);
    
    // Check if there are any products with this brand
    if (categoryWithBrand.brand) {
      const productsWithBrand = await Product.find({ brand: categoryWithBrand.brand._id });
      console.log(`📦 Products with same brand: ${productsWithBrand.length}`);
      
      productsWithBrand.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.itemName} (brand: ${product.brand}, category: ${product.category})`);
      });
    }

    // Method 5: Check if products exist but have different category references
    console.log('\n🔍 Checking for category reference mismatches...');
    const allCategories = await Category.find();
    console.log(`📁 Total categories: ${allCategories.length}`);
    
    for (const category of allCategories) {
      const productCount = await Product.countDocuments({ category: category._id });
      console.log(`   Category "${category.name}" (${category._id}): ${productCount} products`);
    }

  } catch (error) {
    console.error('❌ Error debugging category filter issue:', error);
  }
};

const main = async () => {
  await connectDB();
  await debugCategoryFilterIssue();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);