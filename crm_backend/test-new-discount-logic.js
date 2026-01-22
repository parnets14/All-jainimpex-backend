import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DiscountMapping from './models/DiscountMapping.js';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testNewDiscountLogic = async () => {
  console.log('\n🧪 Testing New Discount Logic');
  console.log('=====================================');
  
  try {
    // Find a discount mapping with "both" type (direct + level-based)
    const discountMapping = await DiscountMapping.findOne({
      discountType: 'both',
      status: 'Approved',
      isActive: true
    });
    
    if (!discountMapping) {
      console.log('❌ No "both" type discount mapping found');
      return;
    }
    
    console.log(`\n📋 Found discount mapping: ${discountMapping.targetType}`);
    console.log(`   Direct Discount: ${discountMapping.directDiscountPercentage}%`);
    console.log(`   Max Discount Limit: ${discountMapping.maxDiscountPercentage}%`);
    console.log(`   Levels: ${discountMapping.levels?.length || 0}`);
    
    if (discountMapping.levels && discountMapping.levels.length > 0) {
      discountMapping.levels.forEach((level, index) => {
        console.log(`     Level ${index + 1}: ${level.levelName} - ${level.discountPercentage}%`);
      });
    }
    
    // Test scenarios
    const scenarios = [
      {
        name: 'Valid: Direct + Level within limit',
        directDiscount: discountMapping.directDiscountPercentage || 0,
        levelDiscount: 3, // Small level discount
        dealerExtraDiscount: 2, // Small dealer extra
        description: 'Should pass validation'
      },
      {
        name: 'Valid: Direct exceeds limit but Level+Extra within limit',
        directDiscount: discountMapping.directDiscountPercentage || 0,
        levelDiscount: (discountMapping.maxDiscountPercentage || 10) - 1, // Just under limit
        dealerExtraDiscount: 0,
        description: 'Should pass - direct discount not limited'
      },
      {
        name: 'Invalid: Level+Extra exceeds limit',
        directDiscount: discountMapping.directDiscountPercentage || 0,
        levelDiscount: (discountMapping.maxDiscountPercentage || 10) - 2,
        dealerExtraDiscount: 5, // This will push Level+Extra over limit
        description: 'Should fail - level+extra exceeds limit'
      }
    ];
    
    console.log('\n🧪 Testing Scenarios:');
    console.log('=====================');
    
    scenarios.forEach((scenario, index) => {
      console.log(`\n${index + 1}. ${scenario.name}`);
      console.log(`   ${scenario.description}`);
      
      const totalDiscount = scenario.directDiscount + scenario.levelDiscount;
      const validatedDiscount = scenario.levelDiscount + scenario.dealerExtraDiscount;
      const maxLimit = discountMapping.maxDiscountPercentage || 100;
      
      console.log(`   📊 Breakdown:`);
      console.log(`     - Direct: ${scenario.directDiscount}% (not limited)`);
      console.log(`     - Level: ${scenario.levelDiscount}%`);
      console.log(`     - Dealer Extra: ${scenario.dealerExtraDiscount}%`);
      console.log(`     - Total Applied: ${totalDiscount + scenario.dealerExtraDiscount}%`);
      console.log(`     - Validated Amount: ${validatedDiscount}% (≤ ${maxLimit}%)`);
      
      // Apply new validation logic
      if (validatedDiscount > maxLimit) {
        console.log(`   ❌ VALIDATION FAILED: ${validatedDiscount}% > ${maxLimit}%`);
        console.log(`   💡 Direct discount of ${scenario.directDiscount}% would still be applied`);
      } else {
        console.log(`   ✅ VALIDATION PASSED: ${validatedDiscount}% ≤ ${maxLimit}%`);
        console.log(`   💰 Total invoice discount: ${totalDiscount + scenario.dealerExtraDiscount}%`);
      }
    });
    
    console.log('\n📝 Summary of New Logic:');
    console.log('========================');
    console.log('✅ Direct Discount: Applied to invoice, NOT counted in max limit validation');
    console.log('✅ Level-based Discount: Applied to invoice, COUNTED in max limit validation');
    console.log('✅ Dealer Extra Discount: Applied to invoice, COUNTED in max limit validation');
    console.log('✅ Max Limit Check: Level-based + Dealer Extra ≤ Max Limit');
    console.log('✅ Final Invoice: Direct + Level-based + Dealer Extra (all applied)');
    
  } catch (error) {
    console.error('❌ Error testing new discount logic:', error);
  }
};

const main = async () => {
  await connectDB();
  await testNewDiscountLogic();
  
  console.log('\n👋 Disconnecting from MongoDB');
  await mongoose.disconnect();
  process.exit(0);
};

main().catch(console.error);