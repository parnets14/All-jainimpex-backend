import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';
import GRN from './models/GRN.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

// Test script to verify the supplier extra discount field mapping fix
async function testSupplierExtraDiscountFieldMappingFix() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Testing Supplier Extra Discount Field Mapping Fix...\n');

    // Step 1: Find the GRN from the screenshot (GRN-1769586738376)
    const grnNumber = 'GRN-1769586738376';
    const grn = await GRN.findOne({ grnNo: grnNumber })
      .populate('supplierId')
      .populate({
        path: 'items.productId',
        populate: [
          { path: 'brand', select: 'name' },
          { path: 'category', select: 'name' },
          { path: 'subcategory', select: 'name' }
        ]
      });
    
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
      console.log('⚠️ ISSUE: Supplier has no extra discounts!');
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

    // Step 3: Test the FIXED field mapping logic
    console.log('\n📦 Testing FIXED Field Mapping Logic...');
    
    for (let i = 0; i < grn.items.length; i++) {
      const item = grn.items[i];
      const product = item.productId;
      
      if (!product) {
        console.log(`   ${i + 1}. Product not found for item`);
        continue;
      }

      console.log(`\n   ${i + 1}. Product: ${product.itemName} (${product.productCode})`);
      console.log(`      Product ID: ${product._id}`);
      
      // FIXED: Use correct field names from Product model
      const productBrandId = product.brand?._id || product.brand;
      const productCategoryId = product.category?._id || product.category;
      const productSubcategoryId = product.subcategory?._id || product.subcategory;
      const productExtendedSubcategoryId = product.extendedSubcategory?._id || product.extendedSubcategory;

      console.log(`      Brand ID: ${productBrandId} (${product.brand?.name || 'N/A'})`);
      console.log(`      Category ID: ${productCategoryId} (${product.category?.name || 'N/A'})`);
      console.log(`      Subcategory ID: ${productSubcategoryId} (${product.subcategory?.name || 'N/A'})`);
      console.log(`      Extended Subcategory ID: ${productExtendedSubcategoryId} (${product.extendedSubcategory?.name || 'N/A'})`);

      // Test the FIXED matching logic
      const matchingDiscounts = supplier.extraDiscounts.filter(discount => {
        if (!discount.isActive && discount.isActive !== undefined) return false;
        
        let matches = false;
        const discountTargetId = String(discount.targetId).trim();

        switch (discount.targetType) {
          case 'product':
            const productIdStr = String(product._id).trim();
            matches = productIdStr === discountTargetId;
            console.log(`         🔍 Product matching: ${productIdStr} vs ${discountTargetId} = ${matches}`);
            break;
            
          case 'brand':
            const productBrandStr = String(productBrandId || '').trim();
            matches = productBrandStr === discountTargetId;
            console.log(`         🔍 Brand matching: ${productBrandStr} vs ${discountTargetId} = ${matches}`);
            break;
            
          case 'category':
            const productCategoryStr = String(productCategoryId || '').trim();
            matches = productCategoryStr === discountTargetId;
            console.log(`         🔍 Category matching: ${productCategoryStr} vs ${discountTargetId} = ${matches}`);
            break;
            
          case 'subcategory':
            const productSubcategoryStr = String(productSubcategoryId || '').trim();
            matches = productSubcategoryStr === discountTargetId;
            console.log(`         🔍 Subcategory matching: ${productSubcategoryStr} vs ${discountTargetId} = ${matches}`);
            break;
            
          case 'extendedSubcategory':
            const productExtendedStr = String(productExtendedSubcategoryId || '').trim();
            matches = productExtendedStr === discountTargetId;
            console.log(`         🔍 Extended subcategory matching: ${productExtendedStr} vs ${discountTargetId} = ${matches}`);
            break;
        }

        return matches;
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
        console.log(`      💰 This should now show as "Supplier Extra: ${bestDiscount.discountPercentage}%" in the invoice`);
      } else {
        console.log('      ❌ NO MATCHES FOUND');
        console.log('      💡 Check if the supplier has extra discounts for this product\'s hierarchy');
      }
    }

    // Step 4: Summary
    console.log('\n🔧 FIELD MAPPING FIX SUMMARY:');
    console.log('   ✅ Fixed field names: product.category, product.brand, product.subcategory');
    console.log('   ✅ Added proper ID extraction: product.category?._id || product.category');
    console.log('   ✅ Enhanced logging for debugging');
    console.log('   ✅ Added active discount filtering');
    
    console.log('\n✅ Field mapping fix test completed!');

  } catch (error) {
    console.error('❌ Error testing supplier extra discount field mapping fix:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testSupplierExtraDiscountFieldMappingFix();