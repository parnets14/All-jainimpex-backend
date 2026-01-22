import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function fixDealerProductAccessLogic() {
  try {
    console.log('🔧 Testing and Demonstrating Dealer Product Access Logic Fix...');
    
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
    
    // Simulate dealer permissions (what you set in Dealer Master)
    const dealerPermissions = {
      allowedBrands: [testBrand._id],
      allowedCategories: [testCategory._id],
      allowedSubcategories: [testSubcategory._id],
      allowedExtendedSubcategories: [] // Empty - no Level 1 extended subcategories selected
    };
    
    console.log('\n🎯 Simulating Dealer Permissions:');
    console.log('   Allowed Brands:', dealerPermissions.allowedBrands.length);
    console.log('   Allowed Categories:', dealerPermissions.allowedCategories.length);
    console.log('   Allowed Subcategories:', dealerPermissions.allowedSubcategories.length);
    console.log('   Allowed Extended Subcategories:', dealerPermissions.allowedExtendedSubcategories.length);
    
    // Test CURRENT (BROKEN) Logic
    console.log('\n❌ CURRENT (BROKEN) LOGIC:');
    const brokenFilter = {};
    
    if (dealerPermissions.allowedBrands.length > 0) {
      brokenFilter.brand = { $in: dealerPermissions.allowedBrands };
    }
    
    if (dealerPermissions.allowedCategories.length > 0) {
      brokenFilter.category = { $in: dealerPermissions.allowedCategories };
    }
    
    if (dealerPermissions.allowedSubcategories.length > 0) {
      brokenFilter.subcategory = { $in: dealerPermissions.allowedSubcategories };
    }
    
    // This is the problematic part - only adds filter if extended subcategories exist
    if (dealerPermissions.allowedExtendedSubcategories.length > 0) {
      brokenFilter.subcategory1 = { $in: dealerPermissions.allowedExtendedSubcategories };
    }
    // Missing: What about products with NO extended subcategories?
    
    console.log('   Filter:', JSON.stringify(brokenFilter, null, 2));
    
    const brokenResults = await Product.find(brokenFilter);
    console.log(`   Results: ${brokenResults.length} products`);
    brokenResults.forEach(p => {
      console.log(`     - ${p.productCode}: ${p.itemName} (Level1: ${p.subcategory1 || 'NULL'})`);
    });
    
    // Test FIXED Logic
    console.log('\n✅ FIXED LOGIC:');
    const fixedFilter = {};
    
    if (dealerPermissions.allowedBrands.length > 0) {
      fixedFilter.brand = { $in: dealerPermissions.allowedBrands };
    }
    
    if (dealerPermissions.allowedCategories.length > 0) {
      fixedFilter.category = { $in: dealerPermissions.allowedCategories };
    }
    
    if (dealerPermissions.allowedSubcategories.length > 0) {
      fixedFilter.subcategory = { $in: dealerPermissions.allowedSubcategories };
    }
    
    // FIXED LOGIC: Handle extended subcategories properly
    if (dealerPermissions.allowedExtendedSubcategories.length > 0) {
      // If dealer has extended subcategory permissions, only show products with those extended subcategories
      fixedFilter.subcategory1 = { $in: dealerPermissions.allowedExtendedSubcategories };
    } else {
      // If dealer has NO extended subcategory permissions, show products with NO extended subcategories
      // This allows access to basic products that only have Brand → Category → Subcategory
      fixedFilter.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
    }
    
    console.log('   Filter:', JSON.stringify(fixedFilter, null, 2));
    
    const fixedResults = await Product.find(fixedFilter);
    console.log(`   Results: ${fixedResults.length} products`);
    fixedResults.forEach(p => {
      console.log(`     - ${p.productCode}: ${p.itemName} (Level1: ${p.subcategory1 || 'NULL'})`);
    });
    
    // Test with products that have extended subcategories
    console.log('\n🧪 Testing with products that HAVE extended subcategories:');
    
    const productsWithExtended = await Product.find({
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id,
      subcategory1: { $exists: true, $ne: null }
    });
    
    console.log(`   Found ${productsWithExtended.length} products with extended subcategories:`);
    productsWithExtended.forEach(p => {
      console.log(`     - ${p.productCode}: ${p.itemName} (Level1: ${p.subcategory1})`);
    });
    
    // Show the complete solution
    console.log('\n💡 COMPLETE SOLUTION:');
    console.log('1. When dealer has NO extended subcategory permissions:');
    console.log('   → Show products with NO extended subcategories (subcategory1 = null)');
    console.log('2. When dealer has extended subcategory permissions:');
    console.log('   → Show products with MATCHING extended subcategories');
    console.log('3. This allows dealers to access basic products even without extended permissions');
    
    // Test the solution with a real scenario
    console.log('\n🎯 REAL SCENARIO TEST:');
    console.log('Dealer selects: Test Brand → Test Category → Test Subcategory (no Level 1 items available)');
    
    const realScenarioFilter = {
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id,
      $or: [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ]
    };
    
    const realResults = await Product.find(realScenarioFilter);
    console.log(`✅ Products accessible: ${realResults.length}`);
    realResults.forEach(p => {
      console.log(`   - ${p.productCode}: ${p.itemName}`);
    });
    
  } catch (error) {
    console.error('❌ Fix test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

fixDealerProductAccessLogic();