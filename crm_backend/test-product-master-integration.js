import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testProductMasterIntegration = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Product Master Integration Scenarios...\n');

    // Find existing test data
    const category = await Category.findOne({ name: 'Test Pipe Category' });
    const subcategory = await Subcategory.findOne({ name: 'PVC Pipe', category: category._id });
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

    if (!category || !subcategory || !extendedLevel1 || !extendedLevel2) {
      console.log('❌ Test data not found. Please run test-category-brand-filtering-fix.js first');
      return;
    }

    const { getBrands } = await import('./controllers/brandController.js');

    // Simulate ProductMaster scenarios
    console.log('🎯 Scenario 1: User selects Category + Subcategory only');
    console.log('   Expected: Should show all brands (Direct Brand, Level 1 Brand, Level 2 Brand)');
    
    await testAPICall(getBrands, {
      category: category._id.toString(),
      subcategory: subcategory._id.toString()
    });

    console.log('\n🎯 Scenario 2: User selects Category + Subcategory + Level 1 Extended');
    console.log('   Expected: Should show Level 1 Brand and Level 2 Brand only');
    
    await testAPICall(getBrands, {
      category: category._id.toString(),
      subcategory: subcategory._id.toString(),
      subcategory1: extendedLevel1._id.toString()
    });

    console.log('\n🎯 Scenario 3: User selects Category + Subcategory + Level 1 + Level 2 Extended');
    console.log('   Expected: Should show Level 2 Brand only');
    
    await testAPICall(getBrands, {
      category: category._id.toString(),
      subcategory: subcategory._id.toString(),
      subcategory1: extendedLevel1._id.toString(),
      subcategory2: extendedLevel2._id.toString()
    });

    console.log('\n🎯 Scenario 4: User selects only Level 3 (without Level 1 and 2)');
    console.log('   Expected: Should show no brands (incomplete hierarchy)');
    
    await testAPICall(getBrands, {
      category: category._id.toString(),
      subcategory: subcategory._id.toString(),
      subcategory3: extendedLevel2._id.toString() // Wrong level assignment
    });

    console.log('\n✅ All Product Master Integration Tests Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

const testAPICall = async (getBrands, queryParams) => {
  const mockReq = {
    query: queryParams,
    user: { _id: 'test' }
  };

  const mockRes = {
    json: (data) => {
      const result = {
        success: data.success,
        brandCount: data.brands?.length || 0,
        brands: data.brands?.map(b => b.name) || []
      };
      
      console.log('📊 Result:', result);
      
      // Validate expected results
      if (queryParams.subcategory1 && queryParams.subcategory2) {
        // Should only show Level 2 Brand
        if (result.brandCount === 1 && result.brands.includes('Level 2 Brand')) {
          console.log('✅ Correct: Only Level 2 Brand shown');
        } else {
          console.log('❌ Error: Expected only Level 2 Brand');
        }
      } else if (queryParams.subcategory1) {
        // Should show Level 1 and Level 2 Brands
        if (result.brandCount === 2 && result.brands.includes('Level 1 Brand') && result.brands.includes('Level 2 Brand')) {
          console.log('✅ Correct: Level 1 and Level 2 Brands shown');
        } else {
          console.log('❌ Error: Expected Level 1 and Level 2 Brands');
        }
      } else if (!queryParams.subcategory1 && !queryParams.subcategory2 && !queryParams.subcategory3) {
        // Should show all brands
        if (result.brandCount === 3) {
          console.log('✅ Correct: All brands shown');
        } else {
          console.log('❌ Error: Expected all 3 brands');
        }
      }
      
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
};

// Run the test
testProductMasterIntegration();