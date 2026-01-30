import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const debugHierarchyFields = async () => {
  try {
    console.log('🔍 Debugging Hierarchy Fields...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check raw brand data
    console.log('📋 RAW BRAND DATA:');
    const brands = await Brand.find({}).lean();
    console.log(`Found ${brands.length} brands:`);
    brands.forEach((brand, index) => {
      console.log(`  ${index + 1}. ${JSON.stringify(brand, null, 2)}`);
    });
    console.log('');

    // Check raw category data
    console.log('📋 RAW CATEGORY DATA:');
    const categories = await Category.find({}).lean();
    console.log(`Found ${categories.length} categories:`);
    categories.forEach((category, index) => {
      console.log(`  ${index + 1}. ${JSON.stringify(category, null, 2)}`);
    });
    console.log('');

    // Check raw subcategory data
    console.log('📋 RAW SUBCATEGORY DATA:');
    const subcategories = await Subcategory.find({}).lean();
    console.log(`Found ${subcategories.length} subcategories:`);
    subcategories.forEach((subcategory, index) => {
      console.log(`  ${index + 1}. ${JSON.stringify(subcategory, null, 2)}`);
    });
    console.log('');

    // Try to manually set isActive for all records
    console.log('🔧 MANUALLY SETTING isActive = true:');
    
    // Update all brands
    for (const brand of brands) {
      await Brand.findByIdAndUpdate(brand._id, { isActive: true });
      console.log(`Updated brand: ${brand.name}`);
    }
    
    // Update all categories
    for (const category of categories) {
      await Category.findByIdAndUpdate(category._id, { isActive: true });
      console.log(`Updated category: ${category.name}`);
    }
    
    // Update all subcategories
    for (const subcategory of subcategories) {
      await Subcategory.findByIdAndUpdate(subcategory._id, { isActive: true });
      console.log(`Updated subcategory: ${subcategory.name}`);
    }

    console.log('\n✅ FINAL VERIFICATION:');
    const activeBrands = await Brand.find({ isActive: true });
    const activeCategories = await Category.find({ isActive: true });
    const activeSubcategories = await Subcategory.find({ isActive: true });
    
    console.log(`Active brands: ${activeBrands.length}`);
    console.log(`Active categories: ${activeCategories.length}`);
    console.log(`Active subcategories: ${activeSubcategories.length}`);

  } catch (error) {
    console.error('❌ Error debugging hierarchy fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugHierarchyFields();