import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Product from './models/Product.js';

dotenv.config();

const checkHierarchyDataStatus = async () => {
  try {
    console.log('🔍 Checking Hierarchy Data Status...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Check all brands (active and inactive)
    console.log('📋 BRANDS STATUS:');
    const allBrands = await Brand.find({}).select('name isActive').sort({ name: 1 });
    const activeBrands = allBrands.filter(b => b.isActive);
    const inactiveBrands = allBrands.filter(b => !b.isActive);
    
    console.log(`Total brands: ${allBrands.length}`);
    console.log(`Active brands: ${activeBrands.length}`);
    console.log(`Inactive brands: ${inactiveBrands.length}`);
    
    if (allBrands.length > 0) {
      console.log('Sample brands:');
      allBrands.slice(0, 5).forEach((brand, index) => {
        console.log(`  ${index + 1}. ${brand.name} (Active: ${brand.isActive})`);
      });
    }
    console.log('');

    // Check all categories (active and inactive)
    console.log('📋 CATEGORIES STATUS:');
    const allCategories = await Category.find({}).select('name isActive').sort({ name: 1 });
    const activeCategories = allCategories.filter(c => c.isActive);
    const inactiveCategories = allCategories.filter(c => !c.isActive);
    
    console.log(`Total categories: ${allCategories.length}`);
    console.log(`Active categories: ${activeCategories.length}`);
    console.log(`Inactive categories: ${inactiveCategories.length}`);
    
    if (allCategories.length > 0) {
      console.log('Sample categories:');
      allCategories.slice(0, 5).forEach((category, index) => {
        console.log(`  ${index + 1}. ${category.name} (Active: ${category.isActive})`);
      });
    }
    console.log('');

    // Check all subcategories (active and inactive)
    console.log('📋 SUBCATEGORIES STATUS:');
    const allSubcategories = await Subcategory.find({}).select('name isActive categoryId').sort({ name: 1 });
    const activeSubcategories = allSubcategories.filter(s => s.isActive);
    const inactiveSubcategories = allSubcategories.filter(s => !s.isActive);
    
    console.log(`Total subcategories: ${allSubcategories.length}`);
    console.log(`Active subcategories: ${activeSubcategories.length}`);
    console.log(`Inactive subcategories: ${inactiveSubcategories.length}`);
    
    if (allSubcategories.length > 0) {
      console.log('Sample subcategories:');
      allSubcategories.slice(0, 5).forEach((subcategory, index) => {
        console.log(`  ${index + 1}. ${subcategory.name} (Active: ${subcategory.isActive})`);
      });
    }
    console.log('');

    // Check products to see what hierarchy data they use
    console.log('📦 PRODUCTS HIERARCHY DATA:');
    const sampleProducts = await Product.find({}).select('itemName brandName categoryName subcategoryName brandId categoryId subcategoryId').limit(10);
    console.log(`Sample of ${sampleProducts.length} products and their hierarchy data:`);
    sampleProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.itemName}`);
      console.log(`     Brand: ${product.brandName} (ID: ${product.brandId})`);
      console.log(`     Category: ${product.categoryName} (ID: ${product.categoryId})`);
      console.log(`     Subcategory: ${product.subcategoryName} (ID: ${product.subcategoryId})`);
    });
    console.log('');

    // Recommendations
    console.log('💡 RECOMMENDATIONS:');
    if (allBrands.length === 0 && allCategories.length === 0 && allSubcategories.length === 0) {
      console.log('❌ No hierarchy data found in Brand/Category/Subcategory collections');
      console.log('✅ Products seem to use brandName/categoryName/subcategoryName fields directly');
      console.log('🔧 SOLUTION: Extract unique values from products to populate filter dropdowns');
    } else if (activeBrands.length === 0 && activeCategories.length === 0 && activeSubcategories.length === 0) {
      console.log('⚠️  Hierarchy collections exist but all records are inactive');
      console.log('🔧 SOLUTION: Either activate existing records or extract from products');
    } else {
      console.log('✅ Some active hierarchy data exists');
    }

  } catch (error) {
    console.error('❌ Error checking hierarchy data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkHierarchyDataStatus();