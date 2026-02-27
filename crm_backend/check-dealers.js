import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';

dotenv.config();

const checkDealers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const dealers = await Dealer.find({}).select('dealerName dealerCode isActive').limit(10);
    
    console.log(`\n📊 Total Dealers: ${await Dealer.countDocuments()}`);
    console.log(`📊 Active Dealers: ${await Dealer.countDocuments({ isActive: true })}`);
    
    if (dealers.length > 0) {
      console.log('\n📋 Sample Dealers:');
      dealers.forEach((dealer, index) => {
        console.log(`${index + 1}. ${dealer.dealerName} (${dealer.dealerCode}) - Active: ${dealer.isActive}`);
      });
    } else {
      console.log('\n⚠️  No dealers found in database');
    }

    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkDealers();
