import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

async function debugDealerProductPermissions() {
  try {
    console.log('🔍 Debugging Dealer Product Permissions Issue...');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB Atlas');
    
    // Find Test Brand
    const testBrand = await Brand.findOne({ name: 'Test Brand' });
    if (!testBrand) {
      console.log('❌ Test Brand not found');
      return;
    }
    console.log(`✅ Found Test Brand: ${testBrand.name} (ID: ${testBrand._id})`);
    
    // Find Test Category
    const testCategory = await Category.findOne({ name: 'Test Category' });
    if (!testCategory) {
      console.log('❌ Test Category not found');
      return;
    }
    console.log(`✅ Found Test Category: ${testCategory.name} (ID: ${testCategory._id})`);
    
    // Find Test Subcategory
    const testSubcategory = await Subcategory.findOne({ name: 'Test Subcategory' });
    if (!testSubcategory) {
      console.log('❌ Test Subcategory not found');
      return;
    }
    console.log(`✅ Found Test Subcategory: ${testSubcategory.name} (ID: ${testSubcategory._id})`);
    
    // Check for Level 1 Extended Subcategories under Test Subcategory
    console.log('\n🔍 Checking Level 1 Extended Subcategories...');
    const level1Extended = await ExtendedSubcategory.find({
      subcategory: testSubcategory._id,
      level: 1
    });
    
    console.log(`📊 Found ${level1Extended.length} Level 1 Extended Subcategories for Test Subcategory:`);
    level1Extended.forEach((ext, index) => {
      console.log(`  ${index + 1}. ${ext.name} (ID: ${ext._id})`);
    });
    
    if (level1Extended.length === 0) {
      console.log('❌ NO Level 1 Extended Subcategories found - This is the problem!');
    }
    
    // Check products under Test Brand → Test Category → Test Subcategory
    console.log('\n📦 Checking products under Test Brand → Test Category → Test Subcategory...');
    const testProducts = await Product.find({
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id
    });
    
    console.log(`📊 Found ${testProducts.length} products:`);
    testProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Level 1: ${product.subcategory1 || 'NULL'}`);
      console.log(`     Level 2: ${product.subcategory2 || 'NULL'}`);
    });
    
    // Check a sample dealer's permissions
    console.log('\n👤 Checking sample dealer permissions...');
    const sampleDealer = await Dealer.findOne({}).populate('productPermissions.brand productPermissions.category productPermissions.subcategory');
    
    if (sampleDealer) {
      console.log(`📊 Sample Dealer: ${sampleDealer.name || sampleDealer.companyName}`);
      console.log(`   Product Permissions: ${sampleDealer.productPermissions?.length || 0}`);
      
      if (sampleDealer.productPermissions && sampleDealer.productPermissions.length > 0) {
        sampleDealer.productPermissions.forEach((perm, index) => {
          console.log(`   ${index + 1}. Brand: ${perm.brand?.name || 'NULL'}`);
          console.log(`      Category: ${perm.category?.name || 'NULL'}`);
          console.log(`      Subcategory: ${perm.subcategory?.name || 'NULL'}`);
          console.log(`      Extended Subcategories: ${perm.extendedSubcategories?.length || 0}`);
        });
      }
    }
    
    // Test the product access logic
    console.log('\n🧪 Testing product access logic...');
    
    // Simulate dealer with Test Brand permissions but no extended subcategories
    const testPermission = {
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id,
      extendedSubcategories: [] // Empty - this is the issue
    };
    
    console.log('🔍 Simulating product query with empty extended subcategories...');
    
    // This is likely how the system queries for accessible products
    let productQuery = {
      brand: testPermission.brand,
      category: testPermission.category,
      subcategory: testPermission.subcategory
    };
    
    // If the system requires extended subcategory matching
    if (testPermission.extendedSubcategories && testPermission.extendedSubcategories.length > 0) {
      productQuery.subcategory1 = { $in: testPermission.extendedSubcategories };
    } else {
      // This might be the problematic logic - requiring subcategory1 to exist
      // productQuery.subcategory1 = { $exists: true, $ne: null };
    }
    
    const accessibleProducts1 = await Product.find(productQuery);
    console.log(`📊 Products accessible with basic query: ${accessibleProducts1.length}`);
    
    // Test with extended subcategory requirement
    const queryWithExtendedRequired = {
      ...productQuery,
      subcategory1: { $exists: true, $ne: null }
    };
    
    const accessibleProducts2 = await Product.find(queryWithExtendedRequired);
    console.log(`📊 Products accessible with extended subcategory required: ${accessibleProducts2.length}`);
    
    // Test without extended subcategory requirement
    const queryWithoutExtendedRequired = {
      brand: testPermission.brand,
      category: testPermission.category,
      subcategory: testPermission.subcategory
      // No extended subcategory requirement
    };
    
    const accessibleProducts3 = await Product.find(queryWithoutExtendedRequired);
    console.log(`📊 Products accessible without extended subcategory requirement: ${accessibleProducts3.length}`);
    
    console.log('\n💡 SOLUTION ANALYSIS:');
    console.log('1. Products exist under Test Brand → Test Category → Test Subcategory');
    console.log('2. No Level 1 Extended Subcategories exist for Test Subcategory');
    console.log('3. Dealer cannot select any extended subcategories (0 of 0 available)');
    console.log('4. System likely requires extended subcategory permissions for product access');
    console.log('5. Need to modify logic to allow access when no extended subcategories exist');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

debugDealerProductPermissions();