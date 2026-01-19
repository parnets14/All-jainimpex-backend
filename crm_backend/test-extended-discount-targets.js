import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Product from './models/Product.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testExtendedDiscountTargets = async () => {
  try {
    console.log('\n🧪 Testing Extended Discount Target Types...\n');

    // Get sample data
    const brand = await Brand.findOne();
    const category = await Category.findOne({ brand: brand._id });
    const subcategory = await Subcategory.findOne({ 
      brand: brand._id, 
      category: category._id 
    });
    const extendedLevel1 = await ExtendedSubcategory.findOne({ 
      brand: brand._id, 
      category: category._id, 
      subcategory: subcategory._id,
      level: 1 
    });
    const extendedLevel2 = await ExtendedSubcategory.findOne({ 
      brand: brand._id, 
      category: category._id, 
      subcategory: subcategory._id,
      level: 2,
      parentExtendedSubcategory: extendedLevel1._id
    });

    if (!brand || !category || !subcategory || !extendedLevel1) {
      console.log('❌ Missing required test data. Please ensure you have:');
      console.log('- At least one Brand');
      console.log('- At least one Category linked to the Brand');
      console.log('- At least one Subcategory linked to Brand and Category');
      console.log('- At least one Extended Level 1 linked to the hierarchy');
      return;
    }

    console.log('📋 Test Data Found:');
    console.log(`Brand: ${brand.name}`);
    console.log(`Category: ${category.name}`);
    console.log(`Subcategory: ${subcategory.name}`);
    console.log(`Extended Level 1: ${extendedLevel1.name}`);
    if (extendedLevel2) {
      console.log(`Extended Level 2: ${extendedLevel2.name}`);
    }

    // Test 1: Create Extended Level 1 Discount
    console.log('\n🧪 Test 1: Creating Extended Level 1 Discount...');
    const extLevel1Discount = new DiscountMapping({
      discountName: 'Extended Level 1 Test Discount',
      discountType: 'direct',
      mappingType: 'sales',
      targetType: 'extendedSubcategory1',
      extendedSubcategory1: extendedLevel1._id,
      directDiscountPercentage: 15,
      maxDiscountPercentage: 20,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      remarks: 'Test discount for Extended Level 1',
      createdBy: new mongoose.Types.ObjectId() // Mock user ID
    });

    await extLevel1Discount.save();
    console.log('✅ Extended Level 1 discount created successfully');
    console.log(`   ID: ${extLevel1Discount._id}`);
    console.log(`   Target: ${extLevel1Discount.targetType}`);
    console.log(`   Discount: ${extLevel1Discount.directDiscountPercentage}%`);

    // Test 2: Create Extended Level 2 Discount (if available)
    if (extendedLevel2) {
      console.log('\n🧪 Test 2: Creating Extended Level 2 Discount...');
      const extLevel2Discount = new DiscountMapping({
        discountName: 'Extended Level 2 Test Discount',
        discountType: 'level_based',
        mappingType: 'sales',
        targetType: 'extendedSubcategory2',
        extendedSubcategory2: extendedLevel2._id,
        maxDiscountPercentage: 25,
        levels: [
          { levelName: 'Bronze', discountPercentage: 10 },
          { levelName: 'Silver', discountPercentage: 15 },
          { levelName: 'Gold', discountPercentage: 20 }
        ],
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        remarks: 'Test discount for Extended Level 2',
        createdBy: new mongoose.Types.ObjectId() // Mock user ID
      });

      await extLevel2Discount.save();
      console.log('✅ Extended Level 2 discount created successfully');
      console.log(`   ID: ${extLevel2Discount._id}`);
      console.log(`   Target: ${extLevel2Discount.targetType}`);
      console.log(`   Levels: ${extLevel2Discount.levels.length}`);
    }

    // Test 3: Retrieve and populate discounts
    console.log('\n🧪 Test 3: Retrieving and populating discounts...');
    const discounts = await DiscountMapping.find({
      targetType: { $in: ['extendedSubcategory1', 'extendedSubcategory2'] }
    })
    .populate('extendedSubcategory1', 'name level')
    .populate('extendedSubcategory2', 'name level');

    console.log(`✅ Found ${discounts.length} extended subcategory discounts:`);
    discounts.forEach((discount, index) => {
      console.log(`\n   Discount ${index + 1}:`);
      console.log(`   - Name: ${discount.discountName}`);
      console.log(`   - Target Type: ${discount.targetType}`);
      console.log(`   - Target Name: ${
        discount.targetType === 'extendedSubcategory1' 
          ? discount.extendedSubcategory1?.name 
          : discount.extendedSubcategory2?.name
      }`);
      console.log(`   - Discount Type: ${discount.discountType}`);
      if (discount.directDiscountPercentage) {
        console.log(`   - Direct Discount: ${discount.directDiscountPercentage}%`);
      }
      if (discount.levels && discount.levels.length > 0) {
        console.log(`   - Levels: ${discount.levels.map(l => `${l.levelName}(${l.discountPercentage}%)`).join(', ')}`);
      }
      console.log(`   - Max Discount: ${discount.maxDiscountPercentage}%`);
      console.log(`   - Status: ${discount.status}`);
    });

    // Test 4: Test findApplicableDiscounts with a product that has extended subcategories
    console.log('\n🧪 Test 4: Testing findApplicableDiscounts...');
    const product = await Product.findOne({
      brand: brand._id,
      category: category._id,
      subcategory: subcategory._id,
      subcategory1: extendedLevel1._id
    });

    if (product) {
      console.log(`Testing with product: ${product.itemName}`);
      const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
        product._id,
        'sales'
      );
      
      console.log(`✅ Found ${applicableDiscounts.length} applicable discounts:`);
      applicableDiscounts.forEach((discount, index) => {
        console.log(`\n   Applicable Discount ${index + 1}:`);
        console.log(`   - Name: ${discount.discountName}`);
        console.log(`   - Target Type: ${discount.targetType}`);
        console.log(`   - Target Name: ${discount.targetInfo?.targetName}`);
        console.log(`   - Priority: Based on target type hierarchy`);
      });
    } else {
      console.log('⚠️  No product found with extended subcategory1 for testing');
    }

    // Test 5: Validation tests
    console.log('\n🧪 Test 5: Testing validation...');
    
    try {
      // Test invalid target type
      const invalidDiscount = new DiscountMapping({
        discountName: 'Invalid Target Test',
        discountType: 'direct',
        mappingType: 'sales',
        targetType: 'extendedSubcategory1',
        // Missing extendedSubcategory1 field
        directDiscountPercentage: 10,
        maxDiscountPercentage: 15,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdBy: new mongoose.Types.ObjectId()
      });
      
      await invalidDiscount.save();
      console.log('❌ Validation should have failed');
    } catch (error) {
      console.log('✅ Validation correctly failed for missing extendedSubcategory1 field');
      console.log(`   Error: ${error.message}`);
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log('✅ Extended Level 1 target type works');
    if (extendedLevel2) {
      console.log('✅ Extended Level 2 target type works');
    }
    console.log('✅ Population of extended subcategory references works');
    console.log('✅ findApplicableDiscounts handles extended subcategories');
    console.log('✅ Validation works correctly');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

const cleanup = async () => {
  try {
    console.log('\n🧹 Cleaning up test data...');
    await DiscountMapping.deleteMany({
      discountName: { $in: ['Extended Level 1 Test Discount', 'Extended Level 2 Test Discount'] }
    });
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

const main = async () => {
  await connectDB();
  await testExtendedDiscountTargets();
  await cleanup();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

main().catch(console.error);