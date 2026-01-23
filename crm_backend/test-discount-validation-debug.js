import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

// Load environment variables
dotenv.config();

const testDiscountValidation = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test the new discount validation logic
    console.log('\n🔍 Testing discount validation logic...');

    // Find a sample product with discount mappings
    const sampleProduct = await Product.findOne({}).populate('brand category subcategory');
    if (!sampleProduct) {
      console.log('❌ No products found');
      return;
    }

    console.log(`📦 Testing with product: ${sampleProduct.itemName} (${sampleProduct.productCode})`);

    // Find applicable discounts for this product
    const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
      sampleProduct._id,
      'sales',
      'Retailer' // Test with retailer dealer type
    );

    console.log(`\n📊 Found ${applicableDiscounts.length} applicable discounts:`);
    
    if (applicableDiscounts.length === 0) {
      console.log('ℹ️ No applicable discounts found for this product');
      
      // Try to find any discount mapping
      const anyDiscount = await DiscountMapping.findOne({
        mappingType: 'sales',
        status: 'Approved'
      }).populate('brand category subcategory');
      
      if (anyDiscount) {
        console.log(`\n📋 Found sample discount mapping: ${anyDiscount.discountName}`);
        console.log(`   - Type: ${anyDiscount.discountType}`);
        console.log(`   - Max Discount: ${anyDiscount.maxDiscountPercentage || 'undefined'}%`);
        console.log(`   - Direct Discount: ${anyDiscount.directDiscountPercentage || 0}%`);
        console.log(`   - Levels: ${anyDiscount.levels?.length || 0}`);
        
        if (anyDiscount.levels && anyDiscount.levels.length > 0) {
          console.log('   - Level Details:');
          anyDiscount.levels.forEach((level, idx) => {
            console.log(`     ${idx + 1}. ${level.levelName}: ${level.discountPercentage}%`);
          });
        }
      }
    } else {
      const discount = applicableDiscounts[0];
      console.log(`\n✅ Testing with discount: ${discount.discountName}`);
      console.log(`   - Type: ${discount.discountType}`);
      console.log(`   - Max Discount: ${discount.maxDiscountPercentage || 'undefined'}%`);
      console.log(`   - Direct Discount: ${discount.directDiscountPercentage || 0}%`);
      console.log(`   - Levels: ${discount.levels?.length || 0}`);
      
      if (discount.levels && discount.levels.length > 0) {
        console.log('   - Level Details:');
        discount.levels.forEach((level, idx) => {
          console.log(`     ${idx + 1}. ${level.levelName}: ${level.discountPercentage}%`);
        });
      }

      // Test the new validation logic
      console.log('\n🧪 Testing NEW discount validation logic:');
      
      const maxDiscountLimit = discount.maxDiscountPercentage || 100;
      const directDiscount = discount.directDiscountPercentage || 0;
      const dealerExtraDiscount = 5; // Example dealer extra discount
      
      // Test different scenarios
      const testScenarios = [
        {
          name: 'Level-based only (within limit)',
          levelDiscount: 8,
          dealerExtra: 0,
          expected: 'PASS'
        },
        {
          name: 'Level-based + Dealer Extra (within limit)',
          levelDiscount: 8,
          dealerExtra: 2,
          expected: 'PASS'
        },
        {
          name: 'Level-based + Dealer Extra (exceeds limit)',
          levelDiscount: 15,
          dealerExtra: 5,
          expected: 'FAIL'
        },
        {
          name: 'Direct + Level + Dealer Extra (level+extra within limit)',
          levelDiscount: 8,
          dealerExtra: 2,
          directDiscount: directDiscount,
          expected: 'PASS'
        }
      ];

      testScenarios.forEach((scenario, idx) => {
        const levelDiscount = scenario.levelDiscount;
        const dealerExtra = scenario.dealerExtra;
        const direct = scenario.directDiscount || 0;
        
        // NEW LOGIC: Only validate level + dealer extra against max limit
        const discountToValidate = levelDiscount + dealerExtra;
        const totalAppliedDiscount = direct + levelDiscount + dealerExtra;
        
        const isValid = discountToValidate <= maxDiscountLimit;
        const result = isValid ? 'PASS' : 'FAIL';
        const status = result === scenario.expected ? '✅' : '❌';
        
        console.log(`\n   ${status} Scenario ${idx + 1}: ${scenario.name}`);
        console.log(`      - Direct Discount: ${direct}% (not limited)`);
        console.log(`      - Level Discount: ${levelDiscount}%`);
        console.log(`      - Dealer Extra: ${dealerExtra}%`);
        console.log(`      - Validated Amount: ${discountToValidate}% (≤ ${maxDiscountLimit}%)`);
        console.log(`      - Total Applied: ${totalAppliedDiscount}%`);
        console.log(`      - Result: ${result} (Expected: ${scenario.expected})`);
      });
    }

    // Check if there are any dealers with extra discounts
    console.log('\n🏪 Checking dealers with extra discounts...');
    const dealersWithExtra = await Dealer.find({
      extraDiscounts: { $exists: true, $ne: [] }
    }).limit(5);

    console.log(`📊 Found ${dealersWithExtra.length} dealers with extra discounts:`);
    dealersWithExtra.forEach((dealer, idx) => {
      console.log(`  ${idx + 1}. ${dealer.name} (${dealer.dealerType})`);
      console.log(`     Extra Discounts: ${dealer.extraDiscounts?.length || 0}`);
      if (dealer.extraDiscounts && dealer.extraDiscounts.length > 0) {
        dealer.extraDiscounts.forEach((extra, extraIdx) => {
          console.log(`       ${extraIdx + 1}. ${extra.productName || extra.product}: ${extra.discountPercentage}%`);
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testDiscountValidation();