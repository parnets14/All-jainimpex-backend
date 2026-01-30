import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const debugProductSelectionModalFilters = async () => {
  try {
    console.log('🔍 Debugging Product Selection Modal Filter Data...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Test Brand API data
    console.log('📋 BRANDS DATA:');
    const brands = await Brand.find({ isActive: true }).select('name description').sort({ name: 1 });
    console.log(`Found ${brands.length} active brands:`);
    brands.forEach((brand, index) => {
      console.log(`  ${index + 1}. ${brand.name} (ID: ${brand._id})`);
    });
    console.log('');

    // Test Category API data
    console.log('📋 CATEGORIES DATA:');
    const categories = await Category.find({ isActive: true }).select('name description').sort({ name: 1 });
    console.log(`Found ${categories.length} active categories:`);
    categories.forEach((category, index) => {
      console.log(`  ${index + 1}. ${category.name} (ID: ${category._id})`);
    });
    console.log('');

    // Test Subcategory API data
    console.log('📋 SUBCATEGORIES DATA:');
    const subcategories = await Subcategory.find({ isActive: true }).select('name description categoryId').sort({ name: 1 });
    console.log(`Found ${subcategories.length} active subcategories:`);
    subcategories.forEach((subcategory, index) => {
      console.log(`  ${index + 1}. ${subcategory.name} (ID: ${subcategory._id}, Category: ${subcategory.categoryId})`);
    });
    console.log('');

    // Test API response format
    console.log('🔧 EXPECTED API RESPONSE FORMAT:');
    console.log('Brands API should return:');
    console.log({
      success: true,
      data: brands.slice(0, 2) // Show first 2 as example
    });
    console.log('');

    console.log('Categories API should return:');
    console.log({
      success: true,
      data: categories.slice(0, 2) // Show first 2 as example
    });
    console.log('');

    console.log('Subcategories API should return:');
    console.log({
      success: true,
      data: subcategories.slice(0, 2) // Show first 2 as example
    });
    console.log('');

    // Check if any data is missing
    console.log('⚠️  POTENTIAL ISSUES:');
    if (brands.length === 0) {
      console.log('❌ No active brands found - this will cause empty Brand dropdown');
    }
    if (categories.length === 0) {
      console.log('❌ No active categories found - this will cause empty Category dropdown');
    }
    if (subcategories.length === 0) {
      console.log('❌ No active subcategories found - this will cause empty Subcategory dropdown');
    }

    if (brands.length > 0 && categories.length > 0 && subcategories.length > 0) {
      console.log('✅ All filter data is available - issue might be in frontend API calls or state management');
    }

    console.log('\n🔧 DEBUGGING STEPS FOR FRONTEND:');
    console.log('1. Check browser console for API call errors');
    console.log('2. Verify API endpoints are responding correctly:');
    console.log('   - GET /api/brands');
    console.log('   - GET /api/categories');
    console.log('   - GET /api/subcategories');
    console.log('3. Check if modalBrands, modalCategories, modalSubcategories state is being set');
    console.log('4. Verify the dropdown rendering logic in ProductSelectionModal');

  } catch (error) {
    console.error('❌ Error debugging filter data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugProductSelectionModalFilters();