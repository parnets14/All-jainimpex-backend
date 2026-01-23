import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const testSimpleDiscountValidation = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🧪 Testing NEW discount validation logic:');
    console.log('=====================================');
    
    // Simulate the new discount validation logic
    const maxDiscountLimit = 15; // Example: 15% max discount limit
    
    const testScenarios = [
      {
        name: 'OLD LOGIC (Total discount validation)',
        directDiscount: 5,
        levelDiscount: 8,
        dealerExtra: 3,
        validationMethod: 'old'
      },
      {
        name: 'NEW LOGIC (Exclude direct from validation)',
        directDiscount: 5,
        levelDiscount: 8,
        dealerExtra: 3,
        validationMethod: 'new'
      },
      {
        name: 'NEW LOGIC - Edge case (Direct high, level+extra within limit)',
        directDiscount: 20, // High direct discount
        levelDiscount: 10,
        dealerExtra: 2,
        validationMethod: 'new'
      },
      {
        name: 'NEW LOGIC - Failure case (Level+extra exceeds limit)',
        directDiscount: 5,
        levelDiscount: 12,
        dealerExtra: 5,
        validationMethod: 'new'
      }
    ];

    testScenarios.forEach((scenario, idx) => {
      const { directDiscount, levelDiscount, dealerExtra, validationMethod } = scenario;
      
      const totalDiscount = directDiscount + levelDiscount + dealerExtra;
      
      let isValid, validatedAmount, explanation;
      
      if (validationMethod === 'old') {
        // OLD LOGIC: Validate total discount against max limit
        validatedAmount = totalDiscount;
        isValid = totalDiscount <= maxDiscountLimit;
        explanation = `Total discount (${totalDiscount}%) ${isValid ? '≤' : '>'} ${maxDiscountLimit}%`;
      } else {
        // NEW LOGIC: Only validate level + dealer extra against max limit
        validatedAmount = levelDiscount + dealerExtra;
        isValid = validatedAmount <= maxDiscountLimit;
        explanation = `Level + Dealer Extra (${validatedAmount}%) ${isValid ? '≤' : '>'} ${maxDiscountLimit}%`;
      }
      
      const status = isValid ? '✅ PASS' : '❌ FAIL';
      
      console.log(`\n${status} Scenario ${idx + 1}: ${scenario.name}`);
      console.log(`   Direct Discount: ${directDiscount}% ${validationMethod === 'new' ? '(not limited)' : ''}`);
      console.log(`   Level Discount: ${levelDiscount}%`);
      console.log(`   Dealer Extra: ${dealerExtra}%`);
      console.log(`   Validated Amount: ${validatedAmount}%`);
      console.log(`   Total Applied: ${totalDiscount}%`);
      console.log(`   Max Limit: ${maxDiscountLimit}%`);
      console.log(`   Validation: ${explanation}`);
      console.log(`   Result: ${isValid ? 'ALLOWED' : 'REJECTED'}`);
    });

    console.log('\n📋 Summary of NEW Logic Benefits:');
    console.log('================================');
    console.log('✅ Direct discounts are not limited by max discount percentage');
    console.log('✅ Only level-based + dealer extra discounts are validated against max limit');
    console.log('✅ Total invoice discount = Direct + Level + Dealer Extra (all applied)');
    console.log('✅ Validation check = Level + Dealer Extra ≤ Max Limit');
    console.log('✅ This allows higher total discounts when direct discounts are involved');

    console.log('\n🔧 Implementation Status:');
    console.log('========================');
    console.log('✅ Frontend: recalculateDiscountWithManualLevels() - UPDATED');
    console.log('✅ Frontend: handleDiscountLevelChange() final validation - UPDATED');
    console.log('✅ Backend: createDealerInvoice() validation - UPDATED');
    console.log('⚠️  User Issue: "not working" - needs debugging');

    console.log('\n🐛 Debugging Steps for User:');
    console.log('============================');
    console.log('1. Open browser Developer Tools (F12)');
    console.log('2. Go to Console tab');
    console.log('3. Try to apply a discount that should fail under old logic but pass under new logic');
    console.log('4. Look for console messages starting with:');
    console.log('   - "🔍 RECALCULATE DEBUG"');
    console.log('   - "🔍 FINAL VALIDATION DEBUG"');
    console.log('   - "💡 NEW DISCOUNT LOGIC"');
    console.log('5. Check if validation warnings appear with new styling');
    console.log('6. If no console logs appear, there might be a caching issue');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the test
testSimpleDiscountValidation();