import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testProductBrandFiltering = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Product Master Brand Filtering...\n');

    // Find existing test data
    const category = await Category.findOne({ name: 'Test Pipe Category' });
    const subcategory = await Subcategory.findOne({ name: 'PVC Pipe', category: category._id });
    
    if (!category || !subcategory) {
      console.log('❌ Test data not found. Please run test-category-brand-filtering-fix.js first');
      return;
    }

    console.log('✅ Found test category:', category.name);
    console.log('✅ Found test subcategory:', subcategory.name);

    // Get all extended subcategories
    const extendedLevel1 = await ExtendedSubcategory.findOne({
      name: '1 inch',
      category: category._id,
      subcategory: subcategory._id,
      level: 1
    });

    const extendedLevel2 = await ExtendedSubcategory.findOne({
      name: 'Schedule 40',
      category: category._id,
      subcategory: subcategory._id,
      level: 2
    });

    console.log('✅ Found extended level 1:', extendedLevel1?.name);
    console.log('✅ Found extended level 2:', extendedLevel2?.name);

    // Get all brands
    const allBrands = await Brand.find({
      category: category._id,
      subcategory: subcategory._id
    }).populate('subcategory1 subcategory2 subcategory3 subcategory4 subcategory5', 'name level');

    console.log('\n📊 All Brands in Database:');
    allBrands.forEach(brand => {
      console.log(`\n🏷️  Brand: ${brand.name}`);
      console.log(`   Category: ${category.name}`);
      console.log(`   Subcategory: ${subcategory.name}`);
      if (brand.subcategory1) console.log(`   Level 1: ${brand.subcategory1.name}`);
      if (brand.subcategory2) console.log(`   Level 2: ${brand.subcategory2.name}`);
      if (brand.subcategory3) console.log(`   Level 3: ${brand.subcategory3.name}`);
      if (brand.subcategory4) console.log(`   Level 4: ${brand.subcategory4.name}`);
      if (brand.subcategory5) console.log(`   Level 5: ${brand.subcategory5.name}`);
    });

    console.log('\n🔍 Testing Different Filtering Scenarios...\n');

    // Test 1: Filter by subcategory only (should show all brands)
    console.log('📋 Test 1: Filter by subcategory only');
    const filter1 = {
      category: category._id,
      subcategory: subcategory._id
    };
    const result1 = await Brand.find(filter1);
    console.log(`   Result: ${result1.length} brands found`);
    result1.forEach(b => console.log(`   - ${b.name}`));

    // Test 2: Filter by subcategory + level 1 extended
    if (extendedLevel1) {
      console.log('\n📋 Test 2: Filter by subcategory + level 1 extended');
      const filter2 = {
        category: category._id,
        subcategory: subcategory._id,
        subcategory1: extendedLevel1._id
      };
      const result2 = await Brand.find(filter2);
      console.log(`   Result: ${result2.length} brands found`);
      result2.forEach(b => console.log(`   - ${b.name}`));
    }

    // Test 3: Filter by subcategory + level 1 + level 2 extended
    if (extendedLevel1 && extendedLevel2) {
      console.log('\n📋 Test 3: Filter by subcategory + level 1 + level 2 extended');
      const filter3 = {
        category: category._id,
        subcategory: subcategory._id,
        subcategory1: extendedLevel1._id,
        subcategory2: extendedLevel2._id
      };
      const result3 = await Brand.find(filter3);
      console.log(`   Result: ${result3.length} brands found`);
      result3.forEach(b => console.log(`   - ${b.name}`));
    }

    // Test 4: Test the API controller logic with direct subcategory parameters
    console.log('\n🧪 Testing API Controller Logic with Direct Parameters...\n');

    const { getBrands } = await import('./controllers/brandController.js');

    // Test scenario: User selects subcategory + level 1 extended (ProductMaster style)
    if (extendedLevel1) {
      console.log('📋 API Test: Subcategory + Level 1 Extended (Direct Parameters)');
      
      const mockReq = {
        query: {
          category: category._id.toString(),
          subcategory: subcategory._id.toString(),
          subcategory1: extendedLevel1._id.toString()
        },
        user: { _id: 'test' }
      };

      const mockRes = {
        json: (data) => {
          console.log('📊 API Response:', {
            success: data.success,
            brandCount: data.brands?.length || 0,
            brands: data.brands?.map(b => b.name) || []
          });
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`❌ API Error ${code}:`, data);
            return data;
          }
        })
      };

      await getBrands(mockReq, mockRes);
    }

    // Test 5: Test with multiple levels (ProductMaster style)
    if (extendedLevel1 && extendedLevel2) {
      console.log('\n📋 API Test: Subcategory + Level 1 + Level 2 Extended (Direct Parameters)');
      
      const mockReq = {
        query: {
          category: category._id.toString(),
          subcategory: subcategory._id.toString(),
          subcategory1: extendedLevel1._id.toString(),
          subcategory2: extendedLevel2._id.toString()
        },
        user: { _id: 'test' }
      };

      const mockRes = {
        json: (data) => {
          console.log('📊 API Response:', {
            success: data.success,
            brandCount: data.brands?.length || 0,
            brands: data.brands?.map(b => b.name) || []
          });
          return data;
        },
        status: (code) => ({
          json: (data) => {
            console.log(`❌ API Error ${code}:`, data);
            return data;
          }
        })
      };

      await getBrands(mockReq, mockRes);
    }

    console.log('\n✅ Product Master Brand Filtering Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testProductBrandFiltering();