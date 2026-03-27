import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
import Dealer from './models/Dealer.js';

const revertDealerCreditLimit = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

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

    console.log(`\n📊 CURRENT STATE:`);
    console.log(`   Dealer: ${dealer.name}`);
    console.log(`   Current Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);

    // Revert to original credit limit
    const originalCreditLimit = 300000;
    dealer.creditLimit = originalCreditLimit;
    await dealer.save();

    console.log(`\n✅ REVERTED:`);
    console.log(`   New Credit Limit: ₹${dealer.creditLimit.toLocaleString()}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

revertDealerCreditLimit();
