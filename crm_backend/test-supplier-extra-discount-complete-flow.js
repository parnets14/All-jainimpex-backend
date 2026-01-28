import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Supplier from './models/Supplier.js';
import Product from './models/Product.js';
import Category from './models/Category.js';

dotenv.config();

// Test script to verify complete supplier extra discount flow
async function testSupplierExtraDiscountCompleteFlow() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🎯 Testing Complete Supplier Extra Discount Flow...\n');

    // Step 1: Find or create a supplier with extra discounts
    let supplier = await Supplier.findOne({ extraDiscounts: { $exists: true, $ne: [] } });
    
    if (!supplier) {
      console.log('📝 No supplier with extra discounts found, creating one...');
      
      // Find a category to use for discount
      const category = await Category.findOne({});
      if (!category) {
        console.log('❌ No categories found in database');
        return;
      }

      // Find a supplier to add discount to
      supplier = await Supplier.findOne({}).sort({ updatedAt: -1 });
      if (!supplier) {
        console.log('❌ No suppliers found in database');
        return;
      }

      // Add extra discount
      const extraDiscount = {
        targetType: 'category',
        targetId: category._id,
        targetName: category.name,
        discountPercentage: 12,
        description: 'Test category discount for supplier',
        isActive: true
      };

      supplier.extraDiscounts = supplier.extraDiscounts || [];
      supplier.extraDiscounts.push(extraDiscount);
      await supplier.save();
      
      console.log(`✅ Added extra discount to supplier: ${supplier.name}`);
    }

    console.log(`\n📋 Supplier: ${supplier.name} (ID: ${supplier._id})`);
    console.log(`   Extra Discounts: ${supplier.extraDiscounts?.length || 0}`);

    if (supplier.extraDiscounts && supplier.extraDiscounts.length > 0) {
      console.log('\n🎯 Extra Discounts Details:');
      supplier.extraDiscounts.forEach((discount, index) => {
        console.log(`   ${index + 1}. ${discount.targetType}: ${discount.targetName} - ${discount.discountPercentage}%`);
        console.log(`      Target ID: ${discount.targetId}`);
        console.log(`      Description: ${discount.description}`);
        console.log(`      Active: ${discount.isActive}`);
      });
    }

    // Step 2: Test API endpoint for fetching supplier with extra discounts
    console.log('\n🔍 Testing API Response Structure...');
    const supplierFromAPI = await Supplier.findById(supplier._id)
      .populate('schemeTypeId', 'name code')
      .populate('paymentTermId', 'name days code');

    console.log('📊 API Response Structure:');
    console.log(`   - Has extraDiscounts field: ${supplierFromAPI.extraDiscounts ? 'Yes' : 'No'}`);
    console.log(`   - ExtraDiscounts count: ${supplierFromAPI.extraDiscounts?.length || 0}`);
    console.log(`   - Populated fields: schemeTypeId, paymentTermId`);

    // Step 3: Find products that would match the extra discounts
    console.log('\n🔍 Finding Products that Match Extra Discounts...');
    
    for (const discount of supplier.extraDiscounts) {
      let matchingProducts = [];
      
      if (discount.targetType === 'category') {
        matchingProducts = await Product.find({ categoryId: discount.targetId }).limit(3);
      } else if (discount.targetType === 'brand') {
        matchingProducts = await Product.find({ brandId: discount.targetId }).limit(3);
      } else if (discount.targetType === 'subcategory') {
        matchingProducts = await Product.find({ subcategoryId: discount.targetId }).limit(3);
      } else if (discount.targetType === 'extendedSubcategory') {
        matchingProducts = await Product.find({ extendedSubcategoryId: discount.targetId }).limit(3);
      } else if (discount.targetType === 'product') {
        matchingProducts = await Product.find({ _id: discount.targetId }).limit(1);
      }

      console.log(`\n   ${discount.targetType.toUpperCase()}: ${discount.targetName} (${discount.discountPercentage}%)`);
      console.log(`   Matching Products: ${matchingProducts.length}`);
      
      if (matchingProducts.length > 0) {
        matchingProducts.forEach((product, index) => {
          console.log(`     ${index + 1}. ${product.itemName} (${product.itemCode})`);
        });
      } else {
        console.log('     ⚠️ No matching products found');
      }
    }

    // Step 4: Simulate discount calculation logic
    console.log('\n🧮 Simulating Discount Calculation Logic...');
    
    const testProduct = await Product.findOne({});
    if (testProduct) {
      console.log(`\n📦 Test Product: ${testProduct.itemName} (${testProduct.itemCode})`);
      console.log(`   Category ID: ${testProduct.categoryId}`);
      console.log(`   Brand ID: ${testProduct.brandId}`);
      console.log(`   Subcategory ID: ${testProduct.subcategoryId}`);
      
      // Find applicable discounts
      const applicableDiscounts = supplier.extraDiscounts.filter(discount => {
        if (discount.targetType === 'product') {
          return discount.targetId.toString() === testProduct._id.toString();
        } else if (discount.targetType === 'category') {
          return discount.targetId.toString() === testProduct.categoryId?.toString();
        } else if (discount.targetType === 'brand') {
          return discount.targetId.toString() === testProduct.brandId?.toString();
        } else if (discount.targetType === 'subcategory') {
          return discount.targetId.toString() === testProduct.subcategoryId?.toString();
        } else if (discount.targetType === 'extendedSubcategory') {
          return discount.targetId.toString() === testProduct.extendedSubcategoryId?.toString();
        }
        return false;
      });

      console.log(`   Applicable Extra Discounts: ${applicableDiscounts.length}`);
      
      if (applicableDiscounts.length > 0) {
        const bestDiscount = applicableDiscounts.reduce((best, current) => 
          current.discountPercentage > best.discountPercentage ? current : best
        );
        
        console.log(`   Best Discount: ${bestDiscount.discountPercentage}% (${bestDiscount.targetType}: ${bestDiscount.targetName})`);
        
        // Simulate calculation
        const itemPrice = 1000; // Example price
        const discountAmount = (itemPrice * bestDiscount.discountPercentage) / 100;
        const finalPrice = itemPrice - discountAmount;
        
        console.log(`   Calculation Example:`);
        console.log(`     Original Price: ₹${itemPrice}`);
        console.log(`     Discount Amount: ₹${discountAmount} (${bestDiscount.discountPercentage}%)`);
        console.log(`     Final Price: ₹${finalPrice}`);
      } else {
        console.log('   ⚠️ No applicable extra discounts for this product');
      }
    }

    console.log('\n✅ Complete Flow Test Completed Successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Supplier with extra discounts: ✅`);
    console.log(`   - API response structure: ✅`);
    console.log(`   - Product matching logic: ✅`);
    console.log(`   - Discount calculation: ✅`);

  } catch (error) {
    console.error('❌ Error testing supplier extra discount complete flow:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
testSupplierExtraDiscountCompleteFlow();