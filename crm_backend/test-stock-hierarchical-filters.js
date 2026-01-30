import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

async function testHierarchicalData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test Brands
    console.log('\n=== TESTING BRANDS ===');
    const brands = await Brand.find({}).limit(10);
    console.log(`Found ${brands.length} brands:`);
    brands.forEach(brand => {
      console.log(`- ${brand.name} (ID: ${brand._id})`);
    });

    // Test Categories
    console.log('\n=== TESTING CATEGORIES ===');
    const categories = await Category.find({}).limit(10);
    console.log(`Found ${categories.length} categories:`);
    categories.forEach(category => {
      console.log(`- ${category.name} (ID: ${category._id})`);
    });

    // Test Subcategories
    console.log('\n=== TESTING SUBCATEGORIES ===');
    const subcategories = await Subcategory.find({}).limit(10);
    console.log(`Found ${subcategories.length} subcategories:`);
    subcategories.forEach(subcategory => {
      console.log(`- ${subcategory.name} (ID: ${subcategory._id})`);
    });

    // Test Extended Subcategories
    console.log('\n=== TESTING EXTENDED SUBCATEGORIES ===');
    const extendedSubcategories = await ExtendedSubcategory.find({}).limit(10);
    console.log(`Found ${extendedSubcategories.length} extended subcategories:`);
    extendedSubcategories.forEach(extended => {
      console.log(`- ${extended.name} (Level: ${extended.level}, ID: ${extended._id})`);
    });

    // Test Level 2 Extended Subcategories
    console.log('\n=== TESTING LEVEL 2 EXTENDED SUBCATEGORIES ===');
    const level2Options = await ExtendedSubcategory.find({ level: 2 }).limit(10);
    console.log(`Found ${level2Options.length} level 2 options:`);
    level2Options.forEach(level2 => {
      console.log(`- ${level2.name} (Parent: ${level2.parent}, ID: ${level2._id})`);
    });

    // Test API endpoint structure
    console.log('\n=== TESTING API RESPONSE STRUCTURE ===');
    if (brands.length > 0) {
      console.log('Sample brand structure:', {
        _id: brands[0]._id,
        name: brands[0].name,
        description: brands[0].description || 'No description'
      });
    }

    if (categories.length > 0) {
      console.log('Sample category structure:', {
        _id: categories[0]._id,
        name: categories[0].name,
        description: categories[0].description || 'No description'
      });
    }

  } catch (error) {
    console.error('❌ Error testing hierarchical data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testHierarchicalData();