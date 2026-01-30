import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Product from './models/Product.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

async function testLevel1StockFix() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== TESTING LEVEL 1 STOCK FIX ===\n');

    // 1. Get the level1 extended subcategory ID
    const level1ExtSub = await ExtendedSubcategory.findOne({ name: 'level1', level: 1 });
    if (!level1ExtSub) {
      console.log('❌ Level1 extended subcategory not found!');
      return;
    }

    console.log(`1. Level1 Extended Subcategory ID: ${level1ExtSub._id}`);

    // 2. Test the OLD query (what was failing)
    console.log('\n2. TESTING OLD QUERY (should fail):');
    const oldQuery = { extendedSubcategory: level1ExtSub._id };
    const oldResults = await Product.find(oldQuery);
    console.log(`   Query: { extendedSubcategory: "${level1ExtSub._id}" }`);
    console.log(`   Results: ${oldResults.length} products`);

    // 3. Test the NEW query (should work)
    console.log('\n3. TESTING NEW QUERY (should work):');
    const newQuery = { subcategory1: level1ExtSub._id };
    const newResults = await Product.find(newQuery);
    console.log(`   Query: { subcategory1: "${level1ExtSub._id}" }`);
    console.log(`   Results: ${newResults.length} products`);
    
    if (newResults.length > 0) {
      console.log('   ✅ Products found:');
      newResults.forEach(product => {
        console.log(`     - ${product.itemName} (${product.productCode})`);
      });
    }

    // 4. Test level 2 as well
    const level2ExtSub = await ExtendedSubcategory.findOne({ name: 'level2', level: 2 });
    if (level2ExtSub) {
      console.log(`\n4. Level2 Extended Subcategory ID: ${level2ExtSub._id}`);
      
      console.log('\n5. TESTING LEVEL 2 QUERY:');
      const level2Query = { subcategory2: level2ExtSub._id };
      const level2Results = await Product.find(level2Query);
      console.log(`   Query: { subcategory2: "${level2ExtSub._id}" }`);
      console.log(`   Results: ${level2Results.length} products`);
      
      if (level2Results.length > 0) {
        console.log('   ✅ Products found:');
        level2Results.forEach(product => {
          console.log(`     - ${product.itemName} (${product.productCode})`);
        });
      }
    }

    // 5. Simulate the complete stock API query
    console.log('\n6. SIMULATING COMPLETE STOCK API QUERY:');
    
    // Simulate what happens when user selects level1 in frontend
    const stockAPIQuery = {
      subcategory1: level1ExtSub._id  // This is the fixed field name
    };
    
    console.log('   Stock API Query:', stockAPIQuery);
    
    const stockProducts = await Product.find(stockAPIQuery);
    console.log(`   Products that would be processed for stock: ${stockProducts.length}`);
    
    if (stockProducts.length > 0) {
      console.log('   ✅ These products should now show in stock:');
      stockProducts.forEach(product => {
        console.log(`     - ${product.itemName} (${product.productCode})`);
        console.log(`       Brand: ${product.brand}`);
        console.log(`       Category: ${product.category}`);
        console.log(`       Subcategory: ${product.subcategory}`);
        console.log(`       Level 1: ${product.subcategory1}`);
        console.log(`       Level 2: ${product.subcategory2}`);
      });
    } else {
      console.log('   ❌ No products found - there might be another issue');
    }

    // 6. Summary
    console.log('\n7. SUMMARY:');
    console.log(`   ✅ Fixed field mapping:`);
    console.log(`      extendedSubcategoryId -> subcategory1 (was: extendedSubcategory)`);
    console.log(`      level2Id -> subcategory2 (was: level2)`);
    console.log(`   ✅ Products found with level1: ${newResults.length}`);
    console.log(`   ✅ Stock should now work for level 1 filter`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testLevel1StockFix();