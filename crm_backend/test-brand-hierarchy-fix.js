import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

const testBrandHierarchyFiltering = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // First, let's see what brands exist and their hierarchy
    console.log('\n📋 Current Brands in Database:');
    const allBrands = await Brand.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name');

    allBrands.forEach((brand, index) => {
      console.log(`${index + 1}. Brand: ${brand.name}`);
      console.log(`   Category: ${brand.category?.name || 'N/A'}`);
      console.log(`   Subcategory: ${brand.subcategory?.name || 'N/A'}`);
      console.log(`   Extended 1: ${brand.subcategory1?.name || 'N/A'}`);
      console.log(`   Extended 2: ${brand.subcategory2?.name || 'N/A'}`);
      console.log(`   Extended 3: ${brand.subcategory3?.name || 'N/A'}`);
      console.log(`   Extended 4: ${brand.subcategory4?.name || 'N/A'}`);
      console.log(`   Extended 5: ${brand.subcategory5?.name || 'N/A'}`);
      console.log('   ---');
    });

    // Test filtering by basic hierarchy (category + subcategory)
    console.log('\n🔍 Testing Basic Hierarchy Filtering:');
    if (allBrands.length > 0) {
      const testBrand = allBrands[0];
      const basicFilter = {
        category: testBrand.category._id,
        subcategory: testBrand.subcategory._id
      };
      
      console.log('Filter:', basicFilter);
      const basicResults = await Brand.find(basicFilter)
        .populate('category', 'name')
        .populate('subcategory', 'name');
      
      console.log(`Found ${basicResults.length} brands with basic filter`);
      basicResults.forEach(brand => {
        console.log(`- ${brand.name} (${brand.category.name} → ${brand.subcategory.name})`);
      });
    }

    // Test filtering with extended subcategories
    console.log('\n🔍 Testing Extended Hierarchy Filtering:');
    const brandsWithExtended = allBrands.filter(brand => 
      brand.subcategory1 || brand.subcategory2 || brand.subcategory3 || brand.subcategory4 || brand.subcategory5
    );

    if (brandsWithExtended.length > 0) {
      const testBrand = brandsWithExtended[0];
      const extendedFilter = {
        category: testBrand.category._id,
        subcategory: testBrand.subcategory._id
      };

      // Add extended subcategory filters if they exist
      if (testBrand.subcategory1) extendedFilter.subcategory1 = testBrand.subcategory1._id;
      if (testBrand.subcategory2) extendedFilter.subcategory2 = testBrand.subcategory2._id;
      if (testBrand.subcategory3) extendedFilter.subcategory3 = testBrand.subcategory3._id;
      if (testBrand.subcategory4) extendedFilter.subcategory4 = testBrand.subcategory4._id;
      if (testBrand.subcategory5) extendedFilter.subcategory5 = testBrand.subcategory5._id;

      console.log('Extended Filter:', extendedFilter);
      const extendedResults = await Brand.find(extendedFilter)
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .populate('subcategory1', 'name')
        .populate('subcategory2', 'name')
        .populate('subcategory3', 'name')
        .populate('subcategory4', 'name')
        .populate('subcategory5', 'name');

      console.log(`Found ${extendedResults.length} brands with extended filter`);
      extendedResults.forEach(brand => {
        const hierarchy = [
          brand.category?.name,
          brand.subcategory?.name,
          brand.subcategory1?.name,
          brand.subcategory2?.name,
          brand.subcategory3?.name,
          brand.subcategory4?.name,
          brand.subcategory5?.name
        ].filter(Boolean).join(' → ');
        console.log(`- ${brand.name} (${hierarchy})`);
      });
    } else {
      console.log('No brands found with extended subcategories');
    }

    // Test the controller logic simulation
    console.log('\n🧪 Simulating Controller Logic:');
    const testParams = {
      category: allBrands[0]?.category._id,
      subcategory: allBrands[0]?.subcategory._id
    };

    if (brandsWithExtended.length > 0) {
      const testBrand = brandsWithExtended[0];
      if (testBrand.subcategory1) testParams.subcategory1 = testBrand.subcategory1._id;
    }

    console.log('Test params:', testParams);

    // Build filter like the controller does
    const filter = {};
    if (testParams.category) filter.category = testParams.category;
    if (testParams.subcategory) filter.subcategory = testParams.subcategory;
    if (testParams.subcategory1) filter.subcategory1 = testParams.subcategory1;
    if (testParams.subcategory2) filter.subcategory2 = testParams.subcategory2;
    if (testParams.subcategory3) filter.subcategory3 = testParams.subcategory3;
    if (testParams.subcategory4) filter.subcategory4 = testParams.subcategory4;
    if (testParams.subcategory5) filter.subcategory5 = testParams.subcategory5;

    console.log('Controller filter:', filter);

    const controllerResults = await Brand.find(filter)
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name');

    console.log(`Controller simulation found ${controllerResults.length} brands`);
    controllerResults.forEach(brand => {
      const hierarchy = [
        brand.category?.name,
        brand.subcategory?.name,
        brand.subcategory1?.name,
        brand.subcategory2?.name,
        brand.subcategory3?.name,
        brand.subcategory4?.name,
        brand.subcategory5?.name
      ].filter(Boolean).join(' → ');
      console.log(`- ${brand.name} (${hierarchy})`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testBrandHierarchyFiltering();