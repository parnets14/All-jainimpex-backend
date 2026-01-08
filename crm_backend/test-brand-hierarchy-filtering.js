// Test script to verify brand hierarchy filtering
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const testBrandHierarchyFiltering = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Test 1: Get all brands
    console.log('\n📋 Test 1: Get all brands');
    const allBrands = await Brand.find()
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name');
    
    console.log(`Found ${allBrands.length} total brands:`);
    allBrands.forEach(brand => {
      console.log(`  - ${brand.name} (Category: ${brand.category?.name}, Subcategory: ${brand.subcategory?.name})`);
      if (brand.subcategory1) console.log(`    └─ Level 1: ${brand.subcategory1.name}`);
      if (brand.subcategory2) console.log(`    └─ Level 2: ${brand.subcategory2.name}`);
      if (brand.subcategory3) console.log(`    └─ Level 3: ${brand.subcategory3.name}`);
      if (brand.subcategory4) console.log(`    └─ Level 4: ${brand.subcategory4.name}`);
      if (brand.subcategory5) console.log(`    └─ Level 5: ${brand.subcategory5.name}`);
    });

    // Test 2: Filter by basic subcategory only
    console.log('\n📋 Test 2: Filter by basic subcategory only');
    if (allBrands.length > 0) {
      const firstBrand = allBrands[0];
      const basicFilter = {
        category: firstBrand.category._id,
        subcategory: firstBrand.subcategory._id
      };
      
      console.log('Filter:', basicFilter);
      const basicFilteredBrands = await Brand.find(basicFilter)
        .populate('category', 'name')
        .populate('subcategory', 'name');
      
      console.log(`Found ${basicFilteredBrands.length} brands with basic filter:`);
      basicFilteredBrands.forEach(brand => {
        console.log(`  - ${brand.name}`);
      });
    }

    // Test 3: Filter by extended hierarchy
    console.log('\n📋 Test 3: Filter by extended hierarchy');
    const brandsWithExtended = allBrands.filter(b => b.subcategory1);
    if (brandsWithExtended.length > 0) {
      const extendedBrand = brandsWithExtended[0];
      const extendedFilter = {
        category: extendedBrand.category._id,
        subcategory: extendedBrand.subcategory._id,
        subcategory1: extendedBrand.subcategory1._id
      };
      
      console.log('Extended filter:', extendedFilter);
      const extendedFilteredBrands = await Brand.find(extendedFilter)
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .populate('subcategory1', 'name');
      
      console.log(`Found ${extendedFilteredBrands.length} brands with extended filter:`);
      extendedFilteredBrands.forEach(brand => {
        console.log(`  - ${brand.name} (Level 1: ${brand.subcategory1?.name})`);
      });
    } else {
      console.log('No brands with extended subcategories found');
    }

    console.log('\n✅ Brand hierarchy filtering test completed');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

testBrandHierarchyFiltering();