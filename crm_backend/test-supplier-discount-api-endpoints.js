const mongoose = require('mongoose');
require('dotenv').config();

// Test script to verify API endpoints for supplier discount targets
async function testSupplierDiscountAPIEndpoints() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import models
    const Brand = require('./models/Brand');
    const Category = require('./models/Category');
    const Subcategory = require('./models/Subcategory');
    const ExtendedSubcategory = require('./models/ExtendedSubcategory');
    const Product = require('./models/Product');

    console.log('\n🎯 Testing Supplier Discount API Endpoints...\n');

    // Test Brands
    console.log('📋 Testing Brands API...');
    const brands = await Brand.find({ isActive: true }).limit(10000);
    console.log(`✅ Brands found: ${brands.length}`);
    if (brands.length > 0) {
      console.log(`   Sample brand: ${brands[0].name} (ID: ${brands[0]._id})`);
    }

    // Test Categories
    console.log('\n📋 Testing Categories API...');
    const categories = await Category.find({ isActive: true }).limit(10000);
    console.log(`✅ Categories found: ${categories.length}`);
    if (categories.length > 0) {
      console.log(`   Sample category: ${categories[0].name} (ID: ${categories[0]._id})`);
    }

    // Test Subcategories
    console.log('\n📋 Testing Subcategories API...');
    const subcategories = await Subcategory.find({ isActive: true }).limit(10000);
    console.log(`✅ Subcategories found: ${subcategories.length}`);
    if (subcategories.length > 0) {
      console.log(`   Sample subcategory: ${subcategories[0].name} (ID: ${subcategories[0]._id})`);
    }

    // Test Extended Subcategories
    console.log('\n📋 Testing Extended Subcategories API...');
    const extendedSubcategories = await ExtendedSubcategory.find({ isActive: true }).limit(10000);
    console.log(`✅ Extended Subcategories found: ${extendedSubcategories.length}`);
    if (extendedSubcategories.length > 0) {
      console.log(`   Sample extended: ${extendedSubcategories[0].name} (ID: ${extendedSubcategories[0]._id})`);
    }

    // Test Products
    console.log('\n📋 Testing Products API...');
    const products = await Product.find({ isActive: true }).limit(10000);
    console.log(`✅ Products found: ${products.length}`);
    if (products.length > 0) {
      console.log(`   Sample product: ${products[0].itemName} (ID: ${products[0]._id})`);
    }

    console.log('\n🎯 API Response Structure Test:');
    console.log('Expected response structure for frontend:');
    console.log('- Brands: { success: true, brands: [...] }');
    console.log('- Categories: { success: true, categories: [...] }');
    console.log('- Subcategories: { success: true, subcategories: [...] }');
    console.log('- Extended: { success: true, extendedSubcategories: [...] }');
    console.log('- Products: { success: true, products: [...] }');

    console.log('\n📊 Summary:');
    console.log(`Total Brands: ${brands.length}`);
    console.log(`Total Categories: ${categories.length}`);
    console.log(`Total Subcategories: ${subcategories.length}`);
    console.log(`Total Extended Subcategories: ${extendedSubcategories.length}`);
    console.log(`Total Products: ${products.length}`);

    if (brands.length === 0 || categories.length === 0 || subcategories.length === 0) {
      console.log('\n⚠️ WARNING: Some collections are empty!');
      console.log('This will cause the supplier discount dropdowns to show "Loading..." or "No items found"');
      console.log('Please ensure you have data in all collections.');
    } else {
      console.log('\n✅ All collections have data - supplier discount dropdowns should work!');
    }

  } catch (error) {
    console.error('❌ Error testing API endpoints:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testSupplierDiscountAPIEndpoints();