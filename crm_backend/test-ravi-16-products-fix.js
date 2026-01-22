import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL);

async function testRavi16ProductsFix() {
  try {
    console.log('🧪 TESTING RAVI 16 PRODUCTS FIX');
    console.log('=' .repeat(60));
    
    // Get Ravi dealer
    const raviDealer = await Dealer.findOne({ name: /ravi/i });
    console.log('👤 Ravi Dealer ID:', raviDealer._id.toString());
    console.log('📊 Permissions:');
    console.log(`  - Brands: ${raviDealer.allowedBrands?.length || 0}`);
    console.log(`  - Categories: ${raviDealer.allowedCategories?.length || 0}`);
    console.log(`  - Subcategories: ${raviDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Extended: ${raviDealer.allowedExtendedSubcategories?.length || 0}`);
    
    // Test OLD logic (what was happening before)
    console.log('\n🔍 Testing OLD Logic (Extended Only)...');
    const oldLogicFilter = {
      status: 'active',
      brand: { $in: raviDealer.allowedBrands },
      category: { $in: raviDealer.allowedCategories },
      subcategory: { $in: raviDealer.allowedSubcategories },
      subcategory1: { $in: raviDealer.allowedExtendedSubcategories } // OLD: Only extended
    };
    
    const oldLogicProducts = await Product.find(oldLogicFilter).select('productCode itemName subcategory1');
    console.log(`📊 OLD Logic Result: ${oldLogicProducts.length} products`);
    
    // Test NEW logic (what should happen now)
    console.log('\n🔍 Testing NEW Logic (Extended + Basic)...');
    const newLogicFilter = {
      status: 'active',
      brand: { $in: raviDealer.allowedBrands },
      category: { $in: raviDealer.allowedCategories },
      subcategory: { $in: raviDealer.allowedSubcategories },
      $or: [
        { subcategory1: { $in: raviDealer.allowedExtendedSubcategories } }, // Products with extended
        { subcategory1: { $exists: false } },                              // Products without extended
        { subcategory1: null }                                             // Products with null extended
      ]
    };
    
    const newLogicProducts = await Product.find(newLogicFilter).select('productCode itemName subcategory1');
    console.log(`📊 NEW Logic Result: ${newLogicProducts.length} products`);
    
    // Show the difference
    console.log('\n📈 COMPARISON:');
    console.log(`  - OLD Logic (Extended Only): ${oldLogicProducts.length} products`);
    console.log(`  - NEW Logic (Extended + Basic): ${newLogicProducts.length} products`);
    console.log(`  - Difference: +${newLogicProducts.length - oldLogicProducts.length} products`);
    
    // Show the additional products
    const oldProductIds = new Set(oldLogicProducts.map(p => p._id.toString()));
    const additionalProducts = newLogicProducts.filter(p => !oldProductIds.has(p._id.toString()));
    
    console.log(`\n🆕 Additional Products (${additionalProducts.length}):`);
    additionalProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Extended L1: ${product.subcategory1 || 'null (basic hierarchy only)'}`);
    });
    
    // Verify the expected result
    console.log('\n✅ VERIFICATION:');
    if (newLogicProducts.length === 16) {
      console.log('🎯 SUCCESS: Ravi now has access to 16 products as expected!');
    } else {
      console.log(`⚠️ Expected 16 products, got ${newLogicProducts.length}`);
    }
    
    // Show all products for reference
    console.log(`\n📋 All ${newLogicProducts.length} Products Ravi Can Access:`);
    newLogicProducts.forEach((product, index) => {
      const type = product.subcategory1 ? 'Extended' : 'Basic';
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName} (${type})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testRavi16ProductsFix();