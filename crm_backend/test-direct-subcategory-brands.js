import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testDirectSubcategoryBrands = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Direct Subcategory Brand Filtering...\n');

    // Find existing test data
    const category = await Category.findOne({ name: 'Test Pipe Category' });
    const subcategory = await Subcategory.findOne({ name: 'PVC Pipe', category: category._id });

    if (!category || !subcategory) {
      console.log('❌ Test data not found. Please run test-category-brand-filtering-fix.js first');
      return;
    }

    console.log('✅ Found test category:', category.name);
    console.log('✅ Found test subcategory:', subcategory.name);

    // Check current brands in database
    const allBrands = await Brand.find({
      category: category._id,
      subcategory: subcategory._id
    });

    console.log('\n📊 Current Brands in Database:');
    allBrands.forEach(brand => {
      const hasExtended = brand.subcategory1 || brand.subcategory2 || brand.subcategory3 || brand.subcategory4 || brand.subcategory5;
      console.log(`   - ${brand.name} ${hasExtended ? '(has extended levels)' : '(direct under subcategory)'}`);
    });

    // Test direct filtering (no extended subcategories)
    console.log('\n🔍 Testing Direct Subcategory Filtering (No Extended Levels)...\n');

    const { getBrands } = await import('./controllers/brandController.js');

    // Test scenario: User selects only Category + Subcategory (no extended levels)
    console.log('📋 API Test: Category + Subcategory Only (ProductMaster scenario)');
    console.log('   Expected: Should show only brands directly under subcategory (no extended levels)');
    
    const mockReq = {
      query: {
        category: category._id.toString(),
        subcategory: subcategory._id.toString()
        // No subcategory1, subcategory2, etc. parameters
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
        
        // Validate that only direct brands are returned
        const directBrands = data.brands?.filter(b => 
          !b.subcategory1 && !b.subcategory2 && !b.subcategory3 && !b.subcategory4 && !b.subcategory5
        ) || [];
        
        console.log(`✅ Direct brands found: ${directBrands.length}`);
        directBrands.forEach(b => console.log(`   - ${b.name}`));
        
        const extendedBrands = data.brands?.filter(b => 
          b.subcategory1 || b.subcategory2 || b.subcategory3 || b.subcategory4 || b.subcategory5
        ) || [];
        
        if (extendedBrands.length > 0) {
          console.log(`❌ ERROR: Found ${extendedBrands.length} brands with extended levels (should be 0):`);
          extendedBrands.forEach(b => console.log(`   - ${b.name}`));
        } else {
          console.log('✅ CORRECT: No brands with extended levels found');
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

    // Also test direct MongoDB query to compare
    console.log('\n🔍 Direct MongoDB Query for Comparison:');
    const directBrandsDB = await Brand.find({
      category: category._id,
      subcategory: subcategory._id,
      subcategory1: null,
      subcategory2: null,
      subcategory3: null,
      subcategory4: null,
      subcategory5: null
    });

    console.log(`📊 Direct MongoDB result: ${directBrandsDB.length} brands found`);
    directBrandsDB.forEach(b => console.log(`   - ${b.name}`));

    console.log('\n✅ Direct Subcategory Brand Filtering Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testDirectSubcategoryBrands();