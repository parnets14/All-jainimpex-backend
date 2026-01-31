import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function debugHierarchyAPIs() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 CHECKING HIERARCHY DATA AVAILABILITY');
    console.log('='.repeat(60));

    // Check Brands
    const brandCount = await Brand.countDocuments({ status: 'active' });
    console.log(`📊 Active Brands: ${brandCount}`);
    
    if (brandCount > 0) {
      const sampleBrands = await Brand.find({ status: 'active' }).limit(3).select('name description');
      console.log('Sample Brands:');
      sampleBrands.forEach(brand => {
        console.log(`  - ${brand.name} (${brand._id})`);
      });
    }

    // Check Categories
    const categoryCount = await Category.countDocuments({ status: 'active' });
    console.log(`\n📊 Active Categories: ${categoryCount}`);
    
    if (categoryCount > 0) {
      const sampleCategories = await Category.find({ status: 'active' }).limit(3).select('name description brand');
      console.log('Sample Categories:');
      sampleCategories.forEach(category => {
        console.log(`  - ${category.name} (Brand: ${category.brand}) (${category._id})`);
      });
    }

    // Check Subcategories
    const subcategoryCount = await Subcategory.countDocuments({ status: 'active' });
    console.log(`\n📊 Active Subcategories: ${subcategoryCount}`);
    
    if (subcategoryCount > 0) {
      const sampleSubcategories = await Subcategory.find({ status: 'active' }).limit(3).select('name description category');
      console.log('Sample Subcategories:');
      sampleSubcategories.forEach(subcategory => {
        console.log(`  - ${subcategory.name} (Category: ${subcategory.category}) (${subcategory._id})`);
      });
    }

    // Check for any data integrity issues
    console.log('\n🔍 CHECKING DATA INTEGRITY');
    console.log('='.repeat(40));

    // Check categories without brands
    const categoriesWithoutBrands = await Category.find({ 
      status: 'active',
      $or: [
        { brand: { $exists: false } },
        { brand: null }
      ]
    }).countDocuments();
    
    if (categoriesWithoutBrands > 0) {
      console.log(`⚠️  Categories without brands: ${categoriesWithoutBrands}`);
    }

    // Check subcategories without categories
    const subcategoriesWithoutCategories = await Subcategory.find({ 
      status: 'active',
      $or: [
        { category: { $exists: false } },
        { category: null }
      ]
    }).countDocuments();
    
    if (subcategoriesWithoutCategories > 0) {
      console.log(`⚠️  Subcategories without categories: ${subcategoriesWithoutCategories}`);
    }

    console.log('\n✅ Hierarchy data check complete');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugHierarchyAPIs();