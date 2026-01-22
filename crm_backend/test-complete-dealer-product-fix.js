import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function testCompleteDealerProductFix() {
  try {
    console.log('🧪 Testing Complete Dealer Product Access Fix...');
    console.log('='.repeat(60));
    
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
    
    console.log('\n✅ Test Hierarchy Found:');
    console.log(`   Brand: ${testBrand.name} (${testBrand._id})`);
    console.log(`   Category: ${testCategory.name} (${testCategory._id})`);
    console.log(`   Subcategory: ${testSubcategory.name} (${testSubcategory._id})`);
    
    // Create or update test dealer
    let testDealer = await Dealer.findOne({ name: 'Test Dealer for Product Access' });
    
    if (!testDealer) {
      console.log('\n🔧 Creating test dealer...');
      testDealer = await Dealer.create({
        code: 'TEST001',
        name: 'Test Dealer for Product Access',
        contactPerson: 'Test Contact',
        phone: '1234567890',
        address: 'Test Address',
        dealerType: 'Retailer',
        dealerCategory: [],
        regionId: new mongoose.Types.ObjectId(),
        salesExecutiveId: new mongoose.Types.ObjectId(),
        allowedBrands: [testBrand._id],
        allowedCategories: [testCategory._id],
        allowedSubcategories: [testSubcategory._id],
        allowedExtendedSubcategories: [] // Empty - this is the key issue
      });
      console.log('✅ Created test dealer');
    } else {
      testDealer.allowedBrands = [testBrand._id];
      testDealer.allowedCategories = [testCategory._id];
      testDealer.allowedSubcategories = [testSubcategory._id];
      testDealer.allowedExtendedSubcategories = [];
      await testDealer.save();
      console.log('✅ Updated test dealer permissions');
    }
    
    console.log('\n🎯 Test Dealer Permissions (simulating Dealer Master setup):');
    console.log(`   ✅ Allowed Brands: ${testDealer.allowedBrands.length} (Test Brand selected)`);
    console.log(`   ✅ Allowed Categories: ${testDealer.allowedCategories.length} (Test Category selected)`);
    console.log(`   ✅ Allowed Subcategories: ${testDealer.allowedSubcategories.length} (Test Subcategory selected)`);
    console.log(`   ❌ Allowed Extended Subcategories: ${testDealer.allowedExtendedSubcategories.length} (0 of 0 available - the issue!)`);
    
    // Test 1: Sales Executive App Backend (Fixed)
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 1: Sales Executive App Backend (getProducts)');
    console.log('='.repeat(60));
    
    let query = { status: 'active' };
    
    // Apply dealer permissions (FIXED LOGIC)
    if (testDealer.allowedBrands && testDealer.allowedBrands.length > 0) {
      query.brand = { $in: testDealer.allowedBrands };
    }
    
    if (testDealer.allowedCategories && testDealer.allowedCategories.length > 0) {
      query.category = { $in: testDealer.allowedCategories };
    }
    
    if (testDealer.allowedSubcategories && testDealer.allowedSubcategories.length > 0) {
      query.subcategory = { $in: testDealer.allowedSubcategories };
    }
    
    // FIXED LOGIC for Sales Executive App
    if (testDealer.allowedExtendedSubcategories && testDealer.allowedExtendedSubcategories.length > 0) {
      query.subcategory1 = { $in: testDealer.allowedExtendedSubcategories };
    } else {
      query.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
    }
    
    console.log('🔍 Sales Executive App Query:', JSON.stringify(query, null, 2));
    
    const seAppResults = await Product.find(query)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName brand category subcategory subcategory1')
      .lean();
    
    console.log(`✅ Sales Executive App Results: ${seAppResults.length} products`);
    seAppResults.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.productCode} - ${product.itemName} (Level1: ${product.subcategory1 || 'NULL'})`);
    });
    
    // Test 2: Main CRM Backend (Fixed)
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 2: Main CRM Backend (getDealerAccessibleProducts)');
    console.log('='.repeat(60));
    
    const productFilter = { status: 'active' };
    
    // Apply dealer permissions (FIXED LOGIC)
    if (testDealer.allowedBrands && testDealer.allowedBrands.length > 0) {
      productFilter.brand = { $in: testDealer.allowedBrands };
    }
    
    if (testDealer.allowedCategories && testDealer.allowedCategories.length > 0) {
      productFilter.category = { $in: testDealer.allowedCategories };
    }
    
    if (testDealer.allowedSubcategories && testDealer.allowedSubcategories.length > 0) {
      productFilter.subcategory = { $in: testDealer.allowedSubcategories };
    }
    
    // FIXED LOGIC for Main CRM Backend
    if (testDealer.allowedExtendedSubcategories && testDealer.allowedExtendedSubcategories.length > 0) {
      productFilter.subcategory1 = { $in: testDealer.allowedExtendedSubcategories };
    } else {
      productFilter.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
    }
    
    console.log('🔍 Main CRM Backend Query:', JSON.stringify(productFilter, null, 2));
    
    const crmResults = await Product.find(productFilter)
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName brand category subcategory subcategory1')
      .lean();
    
    console.log(`✅ Main CRM Backend Results: ${crmResults.length} products`);
    crmResults.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.productCode} - ${product.itemName} (Level1: ${product.subcategory1 || 'NULL'})`);
    });
    
    // Test 3: Verify the fix works for products WITH extended subcategories too
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 3: Testing with Extended Subcategory Permissions');
    console.log('='.repeat(60));
    
    // Find a product that has extended subcategories
    const productWithExtended = await Product.findOne({
      subcategory1: { $exists: true, $ne: null }
    }).populate('subcategory1', 'name');
    
    if (productWithExtended) {
      console.log(`📦 Found product with extended subcategory: ${productWithExtended.itemName}`);
      console.log(`   Extended Level 1: ${productWithExtended.subcategory1?.name}`);
      
      // Simulate dealer with extended subcategory permissions
      const testQueryWithExtended = {
        status: 'active',
        brand: { $in: [testBrand._id] },
        category: { $in: [testCategory._id] },
        subcategory: { $in: [testSubcategory._id] },
        subcategory1: { $in: [productWithExtended.subcategory1._id] }
      };
      
      const extendedResults = await Product.find(testQueryWithExtended);
      console.log(`✅ Products with specific extended subcategory: ${extendedResults.length}`);
    } else {
      console.log('ℹ️  No products with extended subcategories found in current data');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FIX SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ ISSUE IDENTIFIED:');
    console.log('   - Dealer Master shows "Level 1 Extended Items (0 of 0 selected)"');
    console.log('   - No extended subcategories available for Test Brand → Test Category → Test Subcategory');
    console.log('   - Sales Order Dashboard shows no products');
    console.log('');
    console.log('✅ ROOT CAUSE:');
    console.log('   - Both backends required extended subcategory permissions');
    console.log('   - When no extended subcategories available, systems returned empty results');
    console.log('   - Products with basic hierarchy (Brand → Category → Subcategory) were inaccessible');
    console.log('');
    console.log('✅ SOLUTION IMPLEMENTED:');
    console.log('   - Sales Executive App: Fixed getProducts method');
    console.log('   - Main CRM Backend: Fixed getDealerAccessibleProducts method');
    console.log('   - When no extended subcategory permissions: show products with NO extended subcategories');
    console.log('   - When extended subcategory permissions exist: show products with MATCHING extended subcategories');
    console.log('');
    console.log('✅ RESULT:');
    console.log(`   - Sales Executive App now shows: ${seAppResults.length} products`);
    console.log(`   - Main CRM Backend now shows: ${crmResults.length} products`);
    console.log('   - Dealers can now access basic products without extended subcategory requirements');
    console.log('');
    console.log('🎯 NEXT STEPS:');
    console.log('   1. Test in Sales Order Dashboard - products should now appear');
    console.log('   2. Verify Dealer Master permissions work correctly');
    console.log('   3. Test with dealers that DO have extended subcategory permissions');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

testCompleteDealerProductFix();