import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';

dotenv.config();

// Debug script to check why supplier extra discount is not applying
async function debugSupplierExtraDiscountMatching() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Debugging Supplier Extra Discount Matching...\n');

    // Step 1: Find the GRN from the screenshot (GRN-1769586738376)
    const grnNumber = 'GRN-1769586738376';
    const grn = await GRN.findOne({ grnNo: grnNumber }).populate('supplierId').populate('items.productId');
    
    if (!grn) {
      console.log(`❌ GRN ${grnNumber} not found`);
      return;
    }

    console.log(`📋 Found GRN: ${grn.grnNo}`);
    console.log(`   Supplier: ${grn.supplierId?.name || 'Unknown'} (ID: ${grn.supplierId?._id})`);
    console.log(`   Items: ${grn.items?.length || 0}`);

    // Step 2: Get supplier details with extra discounts
    const supplier = await Supplier.findById(grn.supplierId._id);
    if (!supplier) {
      console.log('❌ Supplier not found');
      return;
    }

    console.log(`\n🏢 Supplier: ${supplier.name}`);
    console.log(`   Extra Discounts: ${supplier.extraDiscounts?.length || 0}`);

    if (!supplier.extraDiscounts || supplier.extraDiscounts.length === 0) {
      console.log('⚠️ ISSUE FOUND: Supplier has no extra discounts!');
      console.log('💡 SOLUTION: Add extra discounts to this supplier in Supplier Master');
      return;
    }

    // Display supplier's extra discounts
    console.log('\n🎯 Supplier Extra Discounts:');
    supplier.extraDiscounts.forEach((discount, index) => {
      console.log(`   ${index + 1}. ${discount.targetType.toUpperCase()}: ${discount.targetName}`);
      console.log(`      Discount: ${discount.discountPercentage}%`);
      console.log(`      Target ID: ${discount.targetId}`);
      console.log(`      Active: ${discount.isActive !== false ? 'Yes' : 'No'}`);
      console.log(`      Description: ${discount.description || 'N/A'}`);
    });

    // Step 3: Check each product in the GRN
    console.log('\n📦 Checking GRN Products for Discount Matching...');
    
    for (let i = 0; i < grn.items.length; i++) {
      const item = grn.items[i];
      const product = item.productId;
      
      if (!product) {
        console.log(`   ${i + 1}. Product not found for item`);
        continue;
      }

      console.log(`\n   ${i + 1}. Product: ${product.itemName} (${product.productCode})`);
      console.log(`      Product ID: ${product._id}`);
      console.log(`      Category ID: ${product.category?._id || product.category}`);
      console.log(`      Brand ID: ${product.brand?._id || product.brand}`);
      console.log(`      Subcategory ID: ${product.subcategory?._id || product.subcategory}`);
      console.log(`      Extended Subcategory ID: ${product.extendedSubcategory?._id || product.extendedSubcategory}`);

      // Check which supplier extra discounts match this product
      const matchingDiscounts = supplier.extraDiscounts.filter(discount => {
        if (!discount.isActive && discount.isActive !== undefined) return false;
        
        if (discount.targetType === 'product') {
          return discount.targetId.toString() === product._id.toString();
        } else if (discount.targetType === 'category') {
          return discount.targetId.toString() === (product.category?._id || product.category)?.toString();
        } else if (discount.targetType === 'brand') {
          return discount.targetId.toString() === (product.brand?._id || product.brand)?.toString();
        } else if (discount.targetType === 'subcategory') {
          return discount.targetId.toString() === (product.subcategory?._id || product.subcategory)?.toString();
        } else if (discount.targetType === 'extendedSubcategory') {
          return discount.targetId.toString() === (product.extendedSubcategory?._id || product.extendedSubcategory)?.toString();
        }
        return false;
      });

      console.log(`      Matching Extra Discounts: ${matchingDiscounts.length}`);
      
      if (matchingDiscounts.length > 0) {
        console.log('      ✅ MATCHES FOUND:');
        matchingDiscounts.forEach((discount, idx) => {
          console.log(`         ${idx + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
        });
        
        const bestDiscount = matchingDiscounts.reduce((best, current) => 
          current.discountPercentage > best.discountPercentage ? current : best
        );
        console.log(`      🏆 Best Discount: ${bestDiscount.discountPercentage}% (${bestDiscount.targetType}: ${bestDiscount.targetName})`);
        console.log(`      💰 This should show as "Supplier Extra: X%" in the invoice`);
      } else {
        console.log('      ❌ NO MATCHES FOUND');
        console.log('      💡 ISSUE: Product doesn\'t match any supplier extra discount criteria');
        console.log('      🔧 SOLUTIONS:');
        console.log('         1. Add extra discount for this product specifically');
        console.log('         2. Add extra discount for this product\'s category');
        console.log('         3. Add extra discount for this product\'s brand');
        console.log('         4. Add extra discount for this product\'s subcategory');
      }
    }

    // Step 4: Provide specific recommendations
    console.log('\n🔧 RECOMMENDATIONS:');
    
    if (supplier.extraDiscounts.length === 0) {
      console.log('   1. Go to Supplier Master → Edit this supplier');
      console.log('   2. Add extra discounts for categories/brands/products you want to discount');
      console.log('   3. Save the supplier');
    } else {
      console.log('   1. Check if your extra discounts target the right categories/brands/products');
      console.log('   2. Verify the Target IDs match the product\'s hierarchy');
      console.log('   3. Make sure extra discounts are Active');
      console.log('   4. Consider adding more specific discounts for products that don\'t match');
    }

    console.log('\n✅ Debug completed!');

  } catch (error) {
    console.error('❌ Error debugging supplier extra discount matching:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the debug
debugSupplierExtraDiscountMatching();