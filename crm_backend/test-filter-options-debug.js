import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function testFilterOptionsDebug() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Filter Options Debug');
    
    // Test 1: Check if brands exist
    console.log('\n1. Checking Brands:');
    const brands = await Brand.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
      .select('name')
      .sort({ name: 1 });
    
    console.log(`   Found ${brands.length} brands:`);
    brands.forEach((brand, index) => {
      console.log(`   ${index + 1}. ${brand.name} (ID: ${brand._id})`);
    });

    // Test 2: Check if categories exist
    console.log('\n2. Checking Categories:');
    const categories = await Category.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
      .select('name')
      .sort({ name: 1 });
    
    console.log(`   Found ${categories.length} categories:`);
    categories.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name} (ID: ${category._id})`);
    });

    // Test 3: Check if subcategories exist
    console.log('\n3. Checking Subcategories:');
    const subcategories = await Subcategory.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
      .select('name')
      .sort({ name: 1 });
    
    console.log(`   Found ${subcategories.length} subcategories:`);
    subcategories.forEach((subcategory, index) => {
      console.log(`   ${index + 1}. ${subcategory.name} (ID: ${subcategory._id})`);
    });

    // Test 4: Simulate the API response
    console.log('\n4. Simulating API Response:');
    const apiResponse = {
      success: true,
      data: {
        brands,
        categories,
        subcategories
      }
    };
    
    console.log('   API Response structure:');
    console.log(`   - brands: ${apiResponse.data.brands.length} items`);
    console.log(`   - categories: ${apiResponse.data.categories.length} items`);
    console.log(`   - subcategories: ${apiResponse.data.subcategories.length} items`);

    // Test 5: Check if any have isActive field
    console.log('\n5. Checking isActive field:');
    
    const brandWithActive = await Brand.findOne({ isActive: { $exists: true } });
    const categoryWithActive = await Category.findOne({ isActive: { $exists: true } });
    const subcategoryWithActive = await Subcategory.findOne({ isActive: { $exists: true } });
    
    console.log(`   Brands with isActive field: ${brandWithActive ? 'Yes' : 'No'}`);
    console.log(`   Categories with isActive field: ${categoryWithActive ? 'Yes' : 'No'}`);
    console.log(`   Subcategories with isActive field: ${subcategoryWithActive ? 'Yes' : 'No'}`);

    console.log('\n🎉 Filter Options Debug Completed!');

    if (brands.length === 0) {
      console.log('\n⚠️  WARNING: No brands found!');
    }
    if (categories.length === 0) {
      console.log('\n⚠️  WARNING: No categories found!');
    }
    if (subcategories.length === 0) {
      console.log('\n⚠️  WARNING: No subcategories found!');
    }

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testFilterOptionsDebug();