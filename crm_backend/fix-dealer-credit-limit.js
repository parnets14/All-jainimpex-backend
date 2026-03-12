import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import Dealer from './models/Dealer.js';
import SalesOrder from './models/SalesOrder.js';

const fixDealerCreditLimit = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find the dealer "shree distributors"
    const dealer = await Dealer.findOne({ 
      $or: [
        { name: /shree distributors/i },
        { code: 'DLR1002' }
      ]
    });

    if (!dealer) {
      console.log('❌ Dealer not found');
      return;
    }

    console.log('\n📊 CURRENT DEALER STATE:');
    console.log(`   Name: ${dealer.name}`);
    console.log(`   Code: ${dealer.code}`);
    console.log(`   Current Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);

    // Find all approved overlimit orders
    const approvedOverlimitOrders = await SalesOrder.find({
      dealer: dealer._id,
      'creditOverlimit.isOverlimit': true,
      'creditOverlimit.approvedBy': { $exists: true }
    });

    console.log(`\n🔍 APPROVED OVERLIMIT ORDERS: ${approvedOverlimitOrders.length}`);
    
    let totalApprovedOverlimit = 0;
    for (const order of approvedOverlimitOrders) {
      const overlimitAmount = order.creditOverlimit.overlimitAmount || 0;
      totalApprovedOverlimit += overlimitAmount;
      console.log(`   Order ${order.orderNumber}: ₹${overlimitAmount.toLocaleString()} overlimit approved`);
    }

    // Calculate the correct credit limit
    const originalCreditLimit = 300000; // Original limit
    const correctCreditLimit = originalCreditLimit + totalApprovedOverlimit;

    console.log(`\n💡 CALCULATION:`);
    console.log(`   Original Credit Limit: ₹${originalCreditLimit.toLocaleString()}`);
    console.log(`   Total Approved Overlimit: ₹${totalApprovedOverlimit.toLocaleString()}`);
    console.log(`   Correct Credit Limit: ₹${correctCreditLimit.toLocaleString()}`);
    console.log(`   Current Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
    console.log(`   Difference: ₹${(correctCreditLimit - dealer.creditLimit).toLocaleString()}`);

    if (dealer.creditLimit !== correctCreditLimit) {
      console.log(`\n🔧 FIXING CREDIT LIMIT...`);
      
      // Update the dealer's credit limit
      dealer.creditLimit = correctCreditLimit;
      await dealer.save();
      
      console.log(`✅ Credit limit updated successfully!`);
      console.log(`   New Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);
    } else {
      console.log(`\n✅ Credit limit is already correct`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

fixDealerCreditLimit();