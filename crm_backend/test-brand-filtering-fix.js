import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

const testBrandFilteringScenarios = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get the brands with extended subcategories
    const brandsWithExtended = await Brand.find({
      $or: [
        { subcategory1: { $exists: true, $ne: null } },
        { subcategory2: { $exists: true, $ne: null } },
        { subcategory3: { $exists: true, $ne: null } },
        { subcategory4: { $exists: true, $ne: null } },
        { subcategory5: { $exists: true, $ne: null } }
      ]
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('subcategory1', 'name')
    .populate('subcategory2', 'name')
    .populate('subcategory3', 'name')
    .populate('subcategory4', 'name')
    .populate('subcategory5', 'name');

    console.log('\n📋 Brands with Extended Subcategories:');
    brandsWithExtended.forEach((brand, index) => {
      const hierarchy = [
        brand.category?.name,
        brand.subcategory?.name,
        brand.subcategory1?.name,
        brand.subcategory2?.name,
        brand.subcategory3?.name,
        brand.subcategory4?.name,
        brand.subcategory5?.name
      ].filter(Boolean).join(' → ');
      console.log(`${index + 1}. ${brand.name}: ${hierarchy}`);
    });

    if (brandsWithExtended.length === 0) {
      console.log('No brands with extended subcategories found');
      return;
    }

    // Test Scenario 1: Filter by exact hierarchy (should find the brand)
    console.log('\n🧪 Test Scenario 1: Exact Hierarchy Match');
    const testBrand = brandsWithExtended[0];
    const exactFilter = {
      category: testBrand.category._id,
      subcategory: testBrand.subcategory._id
    };
    if (testBrand.subcategory1) exactFilter.subcategory1 = testBrand.subcategory1._id;
    if (testBrand.subcategory2) exactFilter.subcategory2 = testBrand.subcategory2._id;
    if (testBrand.subcategory3) exactFilter.subcategory3 = testBrand.subcategory3._id;
    if (testBrand.subcategory4) exactFilter.subcategory4 = testBrand.subcategory4._id;
    if (testBrand.subcategory5) exactFilter.subcategory5 = testBrand.subcategory5._id;

    console.log('Filter:', exactFilter);
    const exactResults = await Brand.find(exactFilter).populate('category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name');
    console.log(`✅ Found ${exactResults.length} brands (Expected: 1+)`);
    exactResults.forEach(brand => {
      const hierarchy = [brand.category?.name, brand.subcategory?.name, brand.subcategory1?.name, brand.subcategory2?.name, brand.subcategory3?.name, brand.subcategory4?.name, brand.subcategory5?.name].filter(Boolean).join(' → ');
      console.log(`   - ${brand.name}: ${hierarchy}`);
    });

    // Test Scenario 2: Filter by partial hierarchy (category + subcategory only)
    console.log('\n🧪 Test Scenario 2: Partial Hierarchy Match (Category + Subcategory)');
    const partialFilter = {
      category: testBrand.category._id,
      subcategory: testBrand.subcategory._id
    };
    console.log('Filter:', partialFilter);
    const partialResults = await Brand.find(partialFilter).populate('category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name');
    console.log(`✅ Found ${partialResults.length} brands (Should include brands with and without extended subcategories)`);
    partialResults.forEach(brand => {
      const hierarchy = [brand.category?.name, brand.subcategory?.name, brand.subcategory1?.name, brand.subcategory2?.name, brand.subcategory3?.name, brand.subcategory4?.name, brand.subcategory5?.name].filter(Boolean).join(' → ');
      console.log(`   - ${brand.name}: ${hierarchy}`);
    });

    // Test Scenario 3: Wrong extended subcategory (should find no brands)
    if (brandsWithExtended.length > 1) {
      console.log('\n🧪 Test Scenario 3: Wrong Extended Subcategory');
      const wrongFilter = {
        category: testBrand.category._id,
        subcategory: testBrand.subcategory._id,
        subcategory1: brandsWithExtended[1].subcategory1?._id || testBrand.subcategory1._id
      };
      
      // Only test if we have different subcategory1 values
      if (testBrand.subcategory1?._id?.toString() !== brandsWithExtended[1].subcategory1?._id?.toString()) {
        console.log('Filter:', wrongFilter);
        const wrongResults = await Brand.find(wrongFilter).populate('category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name');
        console.log(`✅ Found ${wrongResults.length} brands (Expected: 0 or different brands)`);
        wrongResults.forEach(brand => {
          const hierarchy = [brand.category?.name, brand.subcategory?.name, brand.subcategory1?.name, brand.subcategory2?.name, brand.subcategory3?.name, brand.subcategory4?.name, brand.subcategory5?.name].filter(Boolean).join(' → ');
          console.log(`   - ${brand.name}: ${hierarchy}`);
        });
      } else {
        console.log('Skipping - both brands have same subcategory1');
      }
    }

    // Test Scenario 4: Simulate API controller behavior
    console.log('\n🧪 Test Scenario 4: API Controller Simulation');
    const apiParams = {
      category: testBrand.category._id.toString(),
      subcategory: testBrand.subcategory._id.toString()
    };
    if (testBrand.subcategory1) apiParams.subcategory1 = testBrand.subcategory1._id.toString();

    // Build filter like the controller does
    const controllerFilter = {};
    if (apiParams.category) controllerFilter.category = apiParams.category;
    if (apiParams.subcategory) controllerFilter.subcategory = apiParams.subcategory;
    if (apiParams.subcategory1) controllerFilter.subcategory1 = apiParams.subcategory1;
    if (apiParams.subcategory2) controllerFilter.subcategory2 = apiParams.subcategory2;
    if (apiParams.subcategory3) controllerFilter.subcategory3 = apiParams.subcategory3;
    if (apiParams.subcategory4) controllerFilter.subcategory4 = apiParams.subcategory4;
    if (apiParams.subcategory5) controllerFilter.subcategory5 = apiParams.subcategory5;

    console.log('API Params:', apiParams);
    console.log('Controller Filter:', controllerFilter);

    const controllerResults = await Brand.find(controllerFilter).populate('category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name');
    console.log(`✅ Controller found ${controllerResults.length} brands`);
    controllerResults.forEach(brand => {
      const hierarchy = [brand.category?.name, brand.subcategory?.name, brand.subcategory1?.name, brand.subcategory2?.name, brand.subcategory3?.name, brand.subcategory4?.name, brand.subcategory5?.name].filter(Boolean).join(' → ');
      console.log(`   - ${brand.name}: ${hierarchy}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testBrandFilteringScenarios();