import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testCategoryMasterBrandCreation = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing Category Master Brand Creation Fix...\n');

    // Find existing test user
    let testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      testUser = await User.create({
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        phone: '1234567890',
        role: 'super_admin'
      });
    }

    // Find the real pipe category and subcategories
    const pipeCategory = await Category.findOne({ name: 'pipe' });
    const nonPvcSubcategory = await Subcategory.findOne({ 
      name: 'non pvc pipe', 
      category: pipeCategory._id 
    });

    if (!pipeCategory || !nonPvcSubcategory) {
      console.log('❌ Real pipe data not found');
      return;
    }

    console.log('✅ Found pipe category:', pipeCategory.name);
    console.log('✅ Found non pvc pipe subcategory:', nonPvcSubcategory.name);

    // Find the extended subcategories in the hierarchy
    const iosPipe = await ExtendedSubcategory.findOne({
      name: 'ios pipe',
      category: pipeCategory._id,
      subcategory: nonPvcSubcategory._id,
      level: 1
    });

    const firstLevel = await ExtendedSubcategory.findOne({
      name: '1st level',
      category: pipeCategory._id,
      subcategory: nonPvcSubcategory._id,
      level: 2,
      parentExtendedSubcategory: iosPipe?._id
    });

    const secondLevel = await ExtendedSubcategory.findOne({
      name: '2nd level',
      category: pipeCategory._id,
      subcategory: nonPvcSubcategory._id,
      level: 3,
      parentExtendedSubcategory: firstLevel?._id
    });

    console.log('✅ Found ios pipe (L1):', iosPipe?.name);
    console.log('✅ Found 1st level (L2):', firstLevel?.name);
    console.log('✅ Found 2nd level (L3):', secondLevel?.name);

    if (!iosPipe || !firstLevel || !secondLevel) {
      console.log('❌ Extended subcategory hierarchy not found');
      return;
    }

    // Test brand creation at the deepest level (2nd level)
    console.log('\n🔍 Testing Brand Creation at Deepest Level...\n');

    const { createBrand } = await import('./controllers/brandController.js');

    // Simulate CategoryMaster creating a brand at: pipe → non pvc pipe → ios pipe → 1st level → 2nd level
    console.log('📋 Simulating CategoryMaster brand creation at deepest level');
    console.log('   Path: pipe → non pvc pipe → ios pipe → 1st level → 2nd level');
    
    const testBrandName = `Test Deep Brand ${Date.now()}`;
    
    const mockReq = {
      body: {
        name: testBrandName,
        description: 'Test brand created at deepest level',
        category: pipeCategory._id.toString(),
        subcategory: nonPvcSubcategory._id.toString(),
        extendedSubcategory: secondLevel._id.toString(), // The deepest level
        level: 3 // Level 3 (2nd level)
      },
      user: testUser
    };

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`📊 Brand creation response (${code}):`, {
            success: data.success,
            message: data.message,
            brandName: data.brand?.name,
            brandId: data.brand?._id
          });
          
          if (data.success && data.brand) {
            console.log('🏗️ Brand hierarchy assignment:');
            console.log(`   Category: ${data.brand.category?.name || 'Not populated'}`);
            console.log(`   Subcategory: ${data.brand.subcategory?.name || 'Not populated'}`);
            console.log(`   Level 1: ${data.brand.subcategory1?.name || 'None'}`);
            console.log(`   Level 2: ${data.brand.subcategory2?.name || 'None'}`);
            console.log(`   Level 3: ${data.brand.subcategory3?.name || 'None'}`);
            console.log(`   Level 4: ${data.brand.subcategory4?.name || 'None'}`);
            console.log(`   Level 5: ${data.brand.subcategory5?.name || 'None'}`);
            
            // Verify the brand was created with correct hierarchy
            if (data.brand.subcategory1 && data.brand.subcategory2 && data.brand.subcategory3) {
              console.log('✅ SUCCESS: Brand created with complete hierarchy path!');
            } else {
              console.log('❌ ERROR: Brand missing hierarchy levels');
            }
          }
          
          return data;
        }
      }),
      json: (data) => {
        console.log('📊 Brand creation success:', {
          success: data.success,
          message: data.message,
          brandName: data.brand?.name
        });
        return data;
      }
    };

    await createBrand(mockReq, mockRes);

    // Verify the brand was created correctly by querying the database
    console.log('\n🔍 Verifying Brand in Database...\n');
    
    const createdBrand = await Brand.findOne({ name: testBrandName })
      .populate('category subcategory subcategory1 subcategory2 subcategory3', 'name');
    
    if (createdBrand) {
      console.log('📊 Database verification:');
      console.log(`   Brand: ${createdBrand.name}`);
      console.log(`   Category: ${createdBrand.category?.name}`);
      console.log(`   Subcategory: ${createdBrand.subcategory?.name}`);
      console.log(`   Level 1: ${createdBrand.subcategory1?.name || 'None'}`);
      console.log(`   Level 2: ${createdBrand.subcategory2?.name || 'None'}`);
      console.log(`   Level 3: ${createdBrand.subcategory3?.name || 'None'}`);
      
      // Test filtering
      console.log('\n🔍 Testing Brand Filtering...\n');
      
      // Should show when filtering by complete hierarchy
      const filteredBrands = await Brand.find({
        category: pipeCategory._id,
        subcategory: nonPvcSubcategory._id,
        subcategory1: iosPipe._id,
        subcategory2: firstLevel._id,
        subcategory3: secondLevel._id
      });
      
      console.log(`📊 Brands found with complete hierarchy filter: ${filteredBrands.length}`);
      filteredBrands.forEach(b => console.log(`   - ${b.name}`));
      
      // Should NOT show when filtering by subcategory only
      const directBrands = await Brand.find({
        category: pipeCategory._id,
        subcategory: nonPvcSubcategory._id,
        subcategory1: null,
        subcategory2: null,
        subcategory3: null,
        subcategory4: null,
        subcategory5: null
      });
      
      console.log(`📊 Direct brands (no extended levels): ${directBrands.length}`);
      directBrands.forEach(b => console.log(`   - ${b.name}`));
      
      if (filteredBrands.length > 0 && !directBrands.find(b => b.name === testBrandName)) {
        console.log('✅ SUCCESS: Brand filtering works correctly!');
      } else {
        console.log('❌ ERROR: Brand filtering not working properly');
      }
      
    } else {
      console.log('❌ ERROR: Brand not found in database');
    }

    console.log('\n✅ Category Master Brand Creation Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testCategoryMasterBrandCreation();