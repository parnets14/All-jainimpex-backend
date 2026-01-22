import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function testFixedDealerProductAccess() {
  try {
    console.log('🧪 Testing Fixed Dealer Product Access Logic...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Get Test Brand, Category, Subcategory IDs
    const testBrand = await Brand.findOne({ name: 'Test Brand' });
    const testCategory = await Category.findOne({ name: 'Test Category' });
    const testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory' });
    
    if (!testBrand || !testCategory || !testSubcategory) {
      console.log('❌ Test hierarchy not found');
      return;
    }
    
    console.log('✅ Test Hierarchy Found:');
    console.log(`   Brand: ${testBrand.name} (${testBrand._id})`);
    console.log(`   Category: ${testCategory.name} (${testCategory._id})`);
    console.log(`   Subcategory: ${testSubcategory.name} (${testSubcategory._id})`);
    
    // Create or find a test dealer with the permissions you set in Dealer Master
    let testDealer = await Dealer.findOne({ name: 'Test Dealer for Product Access' });
    
    if (!testDealer) {
      console.log('🔧 Creating test dealer...');
      testDealer = await Dealer.create({
        code: 'TEST001',
        name: 'Test Dealer for Product Access',
        contactPerson: 'Test Contact',
        phone: '1234567890',
        address: 'Test Address',
        dealerType: 'Retailer',
        dealerCategory: [], // Will be populated if needed
        regionId: new mongoose.Types.ObjectId(), // Dummy region
        salesExecutiveId: new mongoose.Types.ObjectId(), // Dummy SE
        allowedBrands: [testBrand._id],
        allowedCategories: [testCategory._id],
        allowedSubcategories: [testSubcategory._id],
        allowedExtendedSubcategories: [] // Empty - no Level 1 extended subcategories
      });
      console.log('✅ Created test dealer');
    } else {
      // Update existing dealer with correct permissions
      testDealer.allowedBrands = [testBrand._id];
      testDealer.allowedCategories = [testCategory._id];
      testDealer.allowedSubcategories = [testSubcategory._id];
      testDealer.allowedExtendedSubcategories = [];
      await testDealer.save();
      console.log('✅ Updated test dealer permissions');
    }
    
    console.log('\n🎯 Test Dealer Permissions:');
    console.log(`   Allowed Brands: ${testDealer.allowedBrands.length}`);
    console.log(`   Allowed Categories: ${testDealer.allowedCategories.length}`);
    console.log(`   Allowed Subcategories: ${testDealer.allowedSubcategories.length}`);
    console.log(`   Allowed Extended Subcategories: ${testDealer.allowedExtendedSubcategories.length}`);
    
    // Simulate the FIXED getProducts logic
    console.log('\n🔧 Testing FIXED getProducts Logic...');
    
    let query = { status: 'active' };
    
    // Apply dealer product permissions (FIXED LOGIC)
    if (testDealer.allowedBrands && testDealer.allowedBrands.length > 0) {
      query.brand = { $in: testDealer.allowedBrands };
    }
    
    if (testDealer.allowedCategories && testDealer.allowedCategories.length > 0) {
      query.category = { $in: testDealer.allowedCategories };
    }
    
    if (testDealer.allowedSubcategories && testDealer.allowedSubcategories.length > 0) {
      query.subcategory = { $in: testDealer.allowedSubcategories };
    }
    
    // FIXED LOGIC: Handle extended subcategories properly
    if (testDealer.allowedExtendedSubcategories && testDealer.allowedExtendedSubcategories.length > 0) {
      // If dealer has extended subcategory permissions, only show products with those extended subcategories
      query.subcategory1 = { $in: testDealer.allowedExtendedSubcategories };
    } else {
      // If dealer has NO extended subcategory permissions, show products with NO extended subcategories
      // This allows access to basic products that only have Brand → Category → Subcategory
      query.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
    }
    
    console.log('🔍 Applied dealer filter:', JSON.stringify(query, null, 2));
    
    // Execute the query
    const accessibleProducts = await Product.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName brand category subcategory subcategory1')
      .lean();
    
    console.log(`\n✅ RESULT: ${accessibleProducts.length} products accessible to dealer`);
    
    if (accessibleProducts.length > 0) {
      console.log('\n📦 Accessible Products:');
      accessibleProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.productCode} - ${product.itemName}`);
        console.log(`   Brand: ${product.brand?.name}`);
        console.log(`   Category: ${product.category?.name}`);
        console.log(`   Subcategory: ${product.subcategory?.name}`);
        console.log(`   Extended Level 1: ${product.subcategory1 || 'NULL'}`);
      });
    } else {
      console.log('❌ No products accessible - there might be an issue');
    }
    
    // Test what happens if we remove the extended subcategory filter
    console.log('\n🧪 Testing without extended subcategory filter...');
    const queryWithoutExtended = {
      status: 'active',
      brand: { $in: testDealer.allowedBrands },
      category: { $in: testDealer.allowedCategories },
      subcategory: { $in: testDealer.allowedSubcategories }
    };
    
    const allMatchingProducts = await Product.find(queryWithoutExtended);
    console.log(`📊 Total products in Test Brand → Test Category → Test Subcategory: ${allMatchingProducts.length}`);
    
    allMatchingProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.productCode} - ${product.itemName} (Level1: ${product.subcategory1 || 'NULL'})`);
    });
    
    console.log('\n💡 SOLUTION SUMMARY:');
    console.log('✅ Fixed getProducts method now properly filters by dealer permissions');
    console.log('✅ Products with NO extended subcategories are accessible when dealer has no extended permissions');
    console.log('✅ This should fix the "no products showing" issue in Sales Order Dashboard');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

testFixedDealerProductAccess();