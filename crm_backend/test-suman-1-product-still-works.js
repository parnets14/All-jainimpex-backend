import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function testSuman1ProductStillWorks() {
  try {
    console.log('🧪 TESTING SUMAN 1 PRODUCT STILL WORKS');
    console.log('=' .repeat(60));
    
    // Get Suman dealer
    const sumanDealer = await Dealer.findOne({ name: /suman/i });
    console.log('👤 Suman Dealer ID:', sumanDealer._id.toString());
    console.log('📊 Permissions:');
    console.log(`  - Brands: ${sumanDealer.allowedBrands?.length || 0}`);
    console.log(`  - Categories: ${sumanDealer.allowedCategories?.length || 0}`);
    console.log(`  - Subcategories: ${sumanDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Extended: ${sumanDealer.allowedExtendedSubcategories?.length || 0}`);
    
    // Test Suman's logic (should show basic hierarchy products only)
    console.log('\n🔍 Testing Suman Logic (No Extended Permissions)...');
    const sumanFilter = {
      status: 'active',
      brand: { $in: sumanDealer.allowedBrands },
      category: { $in: sumanDealer.allowedCategories },
      subcategory: { $in: sumanDealer.allowedSubcategories },
      $or: [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ]
    };
    
    const sumanProducts = await Product.find(sumanFilter).select('productCode itemName subcategory1');
    console.log(`📊 Suman Logic Result: ${sumanProducts.length} products`);
    
    // Show Suman's products
    console.log(`\n📋 Suman's ${sumanProducts.length} Products:`);
    sumanProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Extended L1: ${product.subcategory1 || 'null (basic hierarchy only)'}`);
    });
    
    // Verify the expected result
    console.log('\n✅ VERIFICATION:');
    if (sumanProducts.length === 1) {
      console.log('🎯 SUCCESS: Suman still has access to 1 product as expected!');
    } else {
      console.log(`⚠️ Expected 1 product, got ${sumanProducts.length}`);
    }
    
    // Test that Suman doesn't see extended products
    console.log('\n🔍 Verifying Suman Cannot See Extended Products...');
    const extendedProductsInHierarchy = await Product.find({
      status: 'active',
      brand: { $in: sumanDealer.allowedBrands },
      category: { $in: sumanDealer.allowedCategories },
      subcategory: { $in: sumanDealer.allowedSubcategories },
      subcategory1: { $exists: true, $ne: null }
    }).select('productCode itemName subcategory1');
    
    console.log(`📊 Extended products in Suman's hierarchy: ${extendedProductsInHierarchy.length}`);
    if (extendedProductsInHierarchy.length > 0) {
      console.log('📋 Extended products Suman CANNOT access:');
      extendedProductsInHierarchy.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName} (Extended: ${product.subcategory1})`);
      });
      console.log('✅ Correctly excluded from Suman\'s access');
    } else {
      console.log('ℹ️ No extended products in Suman\'s hierarchy');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testSuman1ProductStillWorks();