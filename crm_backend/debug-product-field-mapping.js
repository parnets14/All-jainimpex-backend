import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

// Debug script to check product field mapping
async function debugProductFieldMapping() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Checking Product Field Mapping...\n');

    // Find the specific product from the GRN
    const product = await Product.findOne({ itemName: 'product1' })
      .populate('category')
      .populate('subcategory') 
      .populate('brand')
      .populate('subcategory1')
      .populate('subcategory2')
      .populate('subcategory3')
      .populate('subcategory4')
      .populate('subcategory5');

    if (!product) {
      console.log('❌ Product "product1" not found');
      return;
    }

    console.log(`📦 Product: ${product.itemName} (${product.itemCode || 'No code'})`);
    console.log(`   Product ID: ${product._id}`);
    console.log('\n🏗️ Product Hierarchy Fields:');
    
    // Check the field mapping issue
    console.log('   Raw Database Fields:');
    console.log(`     - category: ${product.category} (${typeof product.category})`);
    console.log(`     - subcategory: ${product.subcategory} (${typeof product.subcategory})`);
    console.log(`     - brand: ${product.brand} (${typeof product.brand})`);
    console.log(`     - subcategory1: ${product.subcategory1} (${typeof product.subcategory1})`);
    console.log(`     - subcategory2: ${product.subcategory2} (${typeof product.subcategory2})`);
    console.log(`     - subcategory3: ${product.subcategory3} (${typeof product.subcategory3})`);
    console.log(`     - subcategory4: ${product.subcategory4} (${typeof product.subcategory4})`);
    console.log(`     - subcategory5: ${product.subcategory5} (${typeof product.subcategory5})`);

    console.log('\n   Populated Fields:');
    console.log(`     - category: ${product.category?.name || 'Not populated'} (ID: ${product.category?._id})`);
    console.log(`     - subcategory: ${product.subcategory?.name || 'Not populated'} (ID: ${product.subcategory?._id})`);
    console.log(`     - brand: ${product.brand?.name || 'Not populated'} (ID: ${product.brand?._id})`);
    console.log(`     - subcategory1: ${product.subcategory1?.name || 'Not populated'} (ID: ${product.subcategory1?._id})`);
    console.log(`     - subcategory2: ${product.subcategory2?.name || 'Not populated'} (ID: ${product.subcategory2?._id})`);

    // Check the field mapping used in SupplierInvoice
    console.log('\n🔍 Field Mapping for Supplier Extra Discount Matching:');
    console.log('   SupplierInvoice.jsx uses these fields:');
    console.log(`     - product.categoryId: ${product.categoryId} (WRONG - should be product.category)`);
    console.log(`     - product.brandId: ${product.brandId} (WRONG - should be product.brand)`);
    console.log(`     - product.subcategoryId: ${product.subcategoryId} (WRONG - should be product.subcategory)`);
    console.log(`     - product.extendedSubcategoryId: ${product.extendedSubcategoryId} (WRONG - should be product.subcategory1)`);

    console.log('\n   Correct field mapping should be:');
    console.log(`     - product.category: ${product.category} ✅`);
    console.log(`     - product.brand: ${product.brand} ✅`);
    console.log(`     - product.subcategory: ${product.subcategory} ✅`);
    console.log(`     - product.subcategory1: ${product.subcategory1} ✅ (Extended Level 1)`);
    console.log(`     - product.subcategory2: ${product.subcategory2} ✅ (Extended Level 2)`);

    // Show what the supplier extra discount is looking for
    console.log('\n🎯 Supplier Extra Discount Target:');
    console.log('   Target Type: category');
    console.log('   Target ID: 6979b7b3be2f2eaac8767ba8');
    console.log('   Target Name: first category');

    console.log('\n🔧 ISSUE IDENTIFIED:');
    console.log('   ❌ SupplierInvoice.jsx is using WRONG field names:');
    console.log('      - Looking for: product.categoryId');
    console.log('      - Should be: product.category');
    console.log('   ❌ This is why the matching fails!');

    console.log('\n💡 SOLUTION:');
    console.log('   1. Fix SupplierInvoice.jsx field mapping');
    console.log('   2. Use product.category instead of product.categoryId');
    console.log('   3. Use product.brand instead of product.brandId');
    console.log('   4. Use product.subcategory instead of product.subcategoryId');
    console.log('   5. Use product.subcategory1 instead of product.extendedSubcategoryId');

  } catch (error) {
    console.error('❌ Error debugging product field mapping:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugProductFieldMapping();