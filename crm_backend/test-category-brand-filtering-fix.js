import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import User from './models/User.js';

dotenv.config();

const testCategoryBrandFiltering = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find or create test user
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

    console.log('\n🧪 Testing Category-Brand Filtering Fix...\n');

    // 1. Create test category
    const category = await Category.findOneAndUpdate(
      { name: 'Test Pipe Category' },
      {
        name: 'Test Pipe Category',
        description: 'Test category for pipe products',
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found category:', category.name);

    // 2. Create test subcategory
    const subcategory = await Subcategory.findOneAndUpdate(
      { name: 'PVC Pipe', category: category._id },
      {
        name: 'PVC Pipe',
        description: 'PVC pipe subcategory',
        category: category._id,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found subcategory:', subcategory.name);

    // 3. Create extended subcategories (nested levels)
    const extended1 = await ExtendedSubcategory.findOneAndUpdate(
      { 
        name: '1 inch',
        category: category._id,
        subcategory: subcategory._id,
        level: 1,
        parentExtendedSubcategory: null
      },
      {
        name: '1 inch',
        description: '1 inch diameter pipes',
        category: category._id,
        subcategory: subcategory._id,
        level: 1,
        parentExtendedSubcategory: null,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found extended level 1:', extended1.name);

    const extended2 = await ExtendedSubcategory.findOneAndUpdate(
      { 
        name: 'Schedule 40',
        category: category._id,
        subcategory: subcategory._id,
        level: 2,
        parentExtendedSubcategory: extended1._id
      },
      {
        name: 'Schedule 40',
        description: 'Schedule 40 thickness',
        category: category._id,
        subcategory: subcategory._id,
        level: 2,
        parentExtendedSubcategory: extended1._id,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found extended level 2:', extended2.name);

    // 4. Create brands at different levels
    
    // Brand directly under subcategory (no extended levels)
    const brandDirect = await Brand.findOneAndUpdate(
      { name: 'Direct Brand', subcategory: subcategory._id },
      {
        name: 'Direct Brand',
        description: 'Brand directly under subcategory',
        category: category._id,
        subcategory: subcategory._id,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found direct brand:', brandDirect.name);

    // Brand under level 1 extended subcategory
    const brandLevel1 = await Brand.findOneAndUpdate(
      { name: 'Level 1 Brand', subcategory: subcategory._id },
      {
        name: 'Level 1 Brand',
        description: 'Brand under level 1 extended subcategory',
        category: category._id,
        subcategory: subcategory._id,
        subcategory1: extended1._id,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found level 1 brand:', brandLevel1.name);

    // Brand under level 2 extended subcategory (with complete hierarchy)
    const brandLevel2 = await Brand.findOneAndUpdate(
      { name: 'Level 2 Brand', subcategory: subcategory._id },
      {
        name: 'Level 2 Brand',
        description: 'Brand under level 2 extended subcategory',
        category: category._id,
        subcategory: subcategory._id,
        subcategory1: extended1._id,
        subcategory2: extended2._id,
        createdBy: testUser._id
      },
      { upsert: true, new: true }
    );
    console.log('✅ Created/Found level 2 brand:', brandLevel2.name);

    console.log('\n🔍 Testing Brand Filtering...\n');

    // Test 1: Get all brands under subcategory (should return all 3)
    const allBrands = await Brand.find({
      category: category._id,
      subcategory: subcategory._id
    });
    console.log(`📊 All brands under subcategory: ${allBrands.length} found`);
    allBrands.forEach(brand => console.log(`   - ${brand.name}`));

    // Test 2: Get brands under level 1 extended subcategory (should return 2: level1 and level2)
    const level1Brands = await Brand.find({
      category: category._id,
      subcategory: subcategory._id,
      subcategory1: extended1._id
    });
    console.log(`\n📊 Brands under level 1 extended: ${level1Brands.length} found`);
    level1Brands.forEach(brand => console.log(`   - ${brand.name}`));

    // Test 3: Get brands under level 2 extended subcategory (should return 1: level2 only)
    const level2Brands = await Brand.find({
      category: category._id,
      subcategory: subcategory._id,
      subcategory1: extended1._id,
      subcategory2: extended2._id
    });
    console.log(`\n📊 Brands under level 2 extended: ${level2Brands.length} found`);
    level2Brands.forEach(brand => console.log(`   - ${brand.name}`));

    // Test 4: Test the new filtering logic with extendedSubcategory parameter
    console.log('\n🧪 Testing New Filtering Logic...\n');

    // Import the brand controller to test the new logic
    const { getBrands } = await import('./controllers/brandController.js');

    // Mock request and response objects
    const mockReq = {
      query: {
        category: category._id.toString(),
        subcategory: subcategory._id.toString(),
        extendedSubcategory: extended2._id.toString(),
        level: '2'
      },
      user: testUser
    };

    const mockRes = {
      json: (data) => {
        console.log('📊 New filtering result:', data);
        if (data.success) {
          console.log(`   Found ${data.brands.length} brands:`);
          data.brands.forEach(brand => console.log(`   - ${brand.name}`));
        }
        return data;
      },
      status: (code) => ({
        json: (data) => {
          console.log(`❌ Error ${code}:`, data);
          return data;
        }
      })
    };

    await getBrands(mockReq, mockRes);

    console.log('\n✅ Category-Brand Filtering Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testCategoryBrandFiltering();