import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const fixHierarchyActiveStatus = async () => {
  try {
    console.log('🔧 Fixing Hierarchy Active Status...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Fix brands - set isActive: true for all brands that don't have this field
    console.log('📋 FIXING BRANDS:');
    const brandUpdateResult = await Brand.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );
    console.log(`Updated ${brandUpdateResult.modifiedCount} brands to active status`);

    // Fix categories - set isActive: true for all categories that don't have this field
    console.log('📋 FIXING CATEGORIES:');
    const categoryUpdateResult = await Category.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );
    console.log(`Updated ${categoryUpdateResult.modifiedCount} categories to active status`);

    // Fix subcategories - set isActive: true for all subcategories that don't have this field
    console.log('📋 FIXING SUBCATEGORIES:');
    const subcategoryUpdateResult = await Subcategory.updateMany(
      { isActive: { $exists: false } },
      { $set: { isActive: true } }
    );
    console.log(`Updated ${subcategoryUpdateResult.modifiedCount} subcategories to active status`);

    console.log('\n✅ VERIFICATION:');
    
    // Verify brands
    const activeBrands = await Brand.find({ isActive: true }).select('name');
    console.log(`Active brands now: ${activeBrands.length}`);
    activeBrands.forEach((brand, index) => {
      console.log(`  ${index + 1}. ${brand.name}`);
    });

    // Verify categories
    const activeCategories = await Category.find({ isActive: true }).select('name');
    console.log(`Active categories now: ${activeCategories.length}`);
    activeCategories.forEach((category, index) => {
      console.log(`  ${index + 1}. ${category.name}`);
    });

    // Verify subcategories
    const activeSubcategories = await Subcategory.find({ isActive: true }).select('name');
    console.log(`Active subcategories now: ${activeSubcategories.length}`);
    activeSubcategories.forEach((subcategory, index) => {
      console.log(`  ${index + 1}. ${subcategory.name}`);
    });

    console.log('\n🎉 Filter dropdowns should now show data!');

  } catch (error) {
    console.error('❌ Error fixing hierarchy active status:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

fixHierarchyActiveStatus();