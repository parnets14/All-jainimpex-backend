import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function debugSuddenHierarchyIssue() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 INVESTIGATING SUDDEN HIERARCHY ISSUE');
    console.log('='.repeat(60));

    // Check if data still exists
    console.log('\n📊 DATA AVAILABILITY CHECK:');
    const brandCount = await Brand.countDocuments();
    const categoryCount = await Category.countDocuments();
    const subcategoryCount = await Subcategory.countDocuments();
    
    console.log(`Total Brands: ${brandCount}`);
    console.log(`Total Categories: ${categoryCount}`);
    console.log(`Total Subcategories: ${subcategoryCount}`);

    // Check active vs inactive
    const activeBrands = await Brand.countDocuments({ status: 'active' });
    const activeCategories = await Category.countDocuments({ status: 'active' });
    const activeSubcategories = await Subcategory.countDocuments({ status: 'active' });
    
    console.log(`\nActive Brands: ${activeBrands}`);
    console.log(`Active Categories: ${activeCategories}`);
    console.log(`Active Subcategories: ${activeSubcategories}`);

    // Check for any recent status changes
    console.log('\n🔍 CHECKING FOR RECENT STATUS CHANGES:');
    
    const recentlyModifiedBrands = await Brand.find({
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    }).select('name status updatedAt');
    
    if (recentlyModifiedBrands.length > 0) {
      console.log('Recently modified brands:');
      recentlyModifiedBrands.forEach(brand => {
        console.log(`  - ${brand.name}: ${brand.status} (Updated: ${brand.updatedAt})`);
      });
    } else {
      console.log('No brands modified in last 24 hours');
    }

    const recentlyModifiedCategories = await Category.find({
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).select('name status updatedAt');
    
    if (recentlyModifiedCategories.length > 0) {
      console.log('Recently modified categories:');
      recentlyModifiedCategories.forEach(category => {
        console.log(`  - ${category.name}: ${category.status} (Updated: ${category.updatedAt})`);
      });
    } else {
      console.log('No categories modified in last 24 hours');
    }

    // Check for any data corruption or missing fields
    console.log('\n🔍 CHECKING FOR DATA CORRUPTION:');
    
    const brandsWithoutName = await Brand.find({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: '' }
      ]
    }).countDocuments();
    
    const categoriesWithoutName = await Category.find({
      $or: [
        { name: { $exists: false } },
        { name: null },
        { name: '' }
      ]
    }).countDocuments();
    
    console.log(`Brands without name: ${brandsWithoutName}`);
    console.log(`Categories without name: ${categoriesWithoutName}`);

    // Check specific brand and category that should exist
    console.log('\n🔍 CHECKING SPECIFIC DATA:');
    const sampleBrand = await Brand.findOne({ status: 'active' });
    if (sampleBrand) {
      console.log(`Sample Brand: ${sampleBrand.name} (${sampleBrand._id})`);
      
      // Check categories for this brand
      const brandCategories = await Category.find({ 
        brand: sampleBrand._id, 
        status: 'active' 
      });
      console.log(`Categories for this brand: ${brandCategories.length}`);
      
      if (brandCategories.length > 0) {
        const sampleCategory = brandCategories[0];
        console.log(`Sample Category: ${sampleCategory.name} (${sampleCategory._id})`);
        
        // Check subcategories for this category
        const categorySubcategories = await Subcategory.find({
          category: sampleCategory._id,
          status: 'active'
        });
        console.log(`Subcategories for this category: ${categorySubcategories.length}`);
      }
    } else {
      console.log('❌ No active brands found!');
    }

    // Check if there are any database connection issues
    console.log('\n🔍 DATABASE CONNECTION STATUS:');
    console.log(`MongoDB connection state: ${mongoose.connection.readyState}`);
    console.log(`Database name: ${mongoose.connection.db?.databaseName}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugSuddenHierarchyIssue();