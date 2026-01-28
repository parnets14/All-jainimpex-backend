import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';

dotenv.config();

// Simple debug script to check supplier extra discount setup
async function debugSupplierExtraDiscountSimple() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Checking Supplier Extra Discount Setup...\n');

    // Step 1: Find suppliers with extra discounts
    const suppliersWithDiscounts = await Supplier.find({ 
      extraDiscounts: { $exists: true, $ne: [] } 
    });

    console.log(`📊 Suppliers with extra discounts: ${suppliersWithDiscounts.length}`);

    if (suppliersWithDiscounts.length === 0) {
      console.log('❌ ISSUE FOUND: No suppliers have extra discounts!');
      console.log('💡 SOLUTION: Go to Supplier Master and add extra discounts to your suppliers');
      return;
    }

    // Step 2: Show each supplier's extra discounts
    for (const supplier of suppliersWithDiscounts) {
      console.log(`\n🏢 Supplier: ${supplier.name} (ID: ${supplier._id})`);
      console.log(`   Extra Discounts: ${supplier.extraDiscounts.length}`);
      
      supplier.extraDiscounts.forEach((discount, index) => {
        console.log(`   ${index + 1}. ${discount.targetType.toUpperCase()}: ${discount.targetName}`);
        console.log(`      Discount: ${discount.discountPercentage}%`);
        console.log(`      Target ID: ${discount.targetId}`);
        console.log(`      Active: ${discount.isActive !== false ? 'Yes' : 'No'}`);
      });

      // Step 3: Find products that match this supplier's discounts
      console.log(`\n   🔍 Finding products that match these discounts:`);
      
      for (const discount of supplier.extraDiscounts) {
        let matchingProducts = [];
        
        try {
          if (discount.targetType === 'category') {
            matchingProducts = await Product.find({ categoryId: discount.targetId }).limit(5);
          } else if (discount.targetType === 'brand') {
            matchingProducts = await Product.find({ brandId: discount.targetId }).limit(5);
          } else if (discount.targetType === 'subcategory') {
            matchingProducts = await Product.find({ subcategoryId: discount.targetId }).limit(5);
          } else if (discount.targetType === 'extendedSubcategory') {
            matchingProducts = await Product.find({ extendedSubcategoryId: discount.targetId }).limit(5);
          } else if (discount.targetType === 'product') {
            matchingProducts = await Product.find({ _id: discount.targetId }).limit(1);
          }

          console.log(`      ${discount.targetType}: ${discount.targetName} → ${matchingProducts.length} products`);
          
          if (matchingProducts.length > 0) {
            console.log(`         ✅ Sample products that will get ${discount.discountPercentage}% extra discount:`);
            matchingProducts.slice(0, 3).forEach((product, idx) => {
              console.log(`            ${idx + 1}. ${product.itemName} (${product.itemCode})`);
            });
          } else {
            console.log(`         ⚠️ No products found for this discount target`);
          }
        } catch (error) {
          console.log(`         ❌ Error checking products: ${error.message}`);
        }
      }
    }

    // Step 4: Test with a sample product
    console.log('\n🧪 Testing with a sample product...');
    const sampleProduct = await Product.findOne({});
    
    if (sampleProduct) {
      console.log(`\n📦 Sample Product: ${sampleProduct.itemName} (${sampleProduct.itemCode})`);
      console.log(`   Product ID: ${sampleProduct._id}`);
      console.log(`   Category ID: ${sampleProduct.categoryId}`);
      console.log(`   Brand ID: ${sampleProduct.brandId}`);
      console.log(`   Subcategory ID: ${sampleProduct.subcategoryId}`);
      
      // Check which suppliers would give this product extra discounts
      for (const supplier of suppliersWithDiscounts) {
        const applicableDiscounts = supplier.extraDiscounts.filter(discount => {
          if (discount.targetType === 'product') {
            return discount.targetId.toString() === sampleProduct._id.toString();
          } else if (discount.targetType === 'category') {
            return discount.targetId.toString() === sampleProduct.categoryId?.toString();
          } else if (discount.targetType === 'brand') {
            return discount.targetId.toString() === sampleProduct.brandId?.toString();
          } else if (discount.targetType === 'subcategory') {
            return discount.targetId.toString() === sampleProduct.subcategoryId?.toString();
          } else if (discount.targetType === 'extendedSubcategory') {
            return discount.targetId.toString() === sampleProduct.extendedSubcategoryId?.toString();
          }
          return false;
        });

        if (applicableDiscounts.length > 0) {
          console.log(`   ✅ Supplier "${supplier.name}" would give extra discounts:`);
          applicableDiscounts.forEach(discount => {
            console.log(`      - ${discount.discountPercentage}% (${discount.targetType}: ${discount.targetName})`);
          });
        }
      }
    }

    console.log('\n📋 SUMMARY:');
    console.log(`   - Suppliers with extra discounts: ${suppliersWithDiscounts.length}`);
    console.log(`   - To see extra discounts in Supplier Invoice:`);
    console.log(`     1. Use a supplier that has extra discounts`);
    console.log(`     2. Select products that match the discount criteria`);
    console.log(`     3. The extra discount should show as "Supplier Extra: ₹X"`);

  } catch (error) {
    console.error('❌ Error debugging supplier extra discount:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugSupplierExtraDiscountSimple();