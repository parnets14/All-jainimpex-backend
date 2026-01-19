import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import Dealer from './models/Dealer.js';

async function testDealerExtraDiscountsDisplay() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find a dealer with extra discounts
    const dealerWithDiscounts = await Dealer.findOne({
      'extraDiscounts.0': { $exists: true }
    }).populate('extraDiscounts.targetId');

    if (!dealerWithDiscounts) {
      console.log('❌ No dealers found with extra discounts');
      return;
    }

    console.log('\n🎯 Testing Dealer Extra Discounts Display');
    console.log('==========================================');
    console.log(`Dealer: ${dealerWithDiscounts.name} (${dealerWithDiscounts.code})`);
    console.log(`Total Extra Discounts: ${dealerWithDiscounts.extraDiscounts.length}`);

    // Display extra discounts
    dealerWithDiscounts.extraDiscounts.forEach((discount, index) => {
      console.log(`\n${index + 1}. Extra Discount:`);
      console.log(`   Target Type: ${discount.targetType}`);
      console.log(`   Target Name: ${discount.targetName}`);
      console.log(`   Discount: ${discount.discountPercentage}%`);
      console.log(`   Description: ${discount.description || 'N/A'}`);
      console.log(`   Active: ${discount.isActive}`);
      console.log(`   Created: ${discount.createdAt.toLocaleDateString('en-IN')}`);
    });

    // Test the API response format
    console.log('\n📊 API Response Format Test:');
    console.log('============================');
    const apiResponse = {
      extraDiscounts: dealerWithDiscounts.extraDiscounts
        .filter(d => d.isActive)
        .map(d => ({
          _id: d._id,
          targetType: d.targetType,
          targetName: d.targetName,
          discountPercentage: d.discountPercentage,
          description: d.description,
          isActive: d.isActive,
          createdAt: d.createdAt
        }))
    };

    console.log('Active Extra Discounts for API:', JSON.stringify(apiResponse, null, 2));

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }
}

testDealerExtraDiscountsDisplay();