import mongoose from 'mongoose';
import Dealer from '../models/Dealer.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkDealerTypes() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    
    const dealers = await Dealer.find({}, 'dealerType');
    const dealerTypes = [...new Set(dealers.map(d => d.dealerType))];
    console.log('Existing dealer types:', dealerTypes);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDealerTypes();



