import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testRealPipeBrands = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Real Pipe Brands (ProductMaster Scenario)...\n');

    // Find the real pipe category and pvc pipe subcategory
    const pipeCategory = await Category.findOne({ name: 'pipe' });
    const pvcPipeSubcategory = await Subcategory.findOne({ 
      name: 'pvc pipe', 
      category: pipeCategory._id 
    });

    if (!pipeCategory || !pvcPipeSubcategory) {
      console.log('❌ Real pipe data not found');
      return;
    }

    console.log('✅ Found pipe category:', pipeCategory.name);
    console.log('✅ Found pvc pipe subcategory:', pvcPipeSubcategory.name);

    // Check all brands under pvc pipe
    const allBrands = await Brand.find({
      category: pipeCategory._id,
      subcategory: pvcPipeSubcategory._id
    });

    console.log('\n📊 All brands under "pipe → pvc pipe":');
    allBrands.forEach(brand => {
      const hasExtended = brand.subcategory1 || brand.subcategory2 || brand.subcategory3 || brand.subcategory4 || brand.subcategory5;
      console.log(`   - ${brand.name} ${hasExtended ? '(has extended levels)' : '(direct)'}`);
    });

    // Test the API with the real data
    console.log('\n🔍 Testing API with Real Data...\n');

    const { getBrands } = await import('./controllers/brandController.js');

    console.log('📋 Scenario: User selects "pipe" category + "pvc pipe" subcategory (NO extended levels)');
    console.log('   Expected: Should show only direct brands (none in this case)');
    
    const mockReq = {
      query: {
        category: pipeCategory._id.toString(),
        subcategory: pvcPipeSubcategory._id.toString()
        // No extended subcategory parameters
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
        
        if (data.brands && data.brands.length > 0) {
          console.log('\n🔍 Detailed brand analysis:');
          data.brands.forEach(brand => {
            const hasExtended = brand.subcategory1 || brand.subcategory2 || brand.subcategory3 || brand.subcategory4 || brand.subcategory5;
            console.log(`   - ${brand.name}: ${hasExtended ? 'HAS EXTENDED LEVELS (❌ SHOULD NOT SHOW)' : 'Direct brand (✅ OK)'}`);
          });
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

    console.log('\n✅ Real Pipe Brands Test Complete!');
    console.log('\n💡 If you still see "creata" and "good brand" in ProductMaster:');
    console.log('   1. Clear browser cache and refresh the page');
    console.log('   2. Check browser network tab to see the actual API request');
    console.log('   3. Make sure no extended subcategory dropdowns are selected');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testRealPipeBrands();