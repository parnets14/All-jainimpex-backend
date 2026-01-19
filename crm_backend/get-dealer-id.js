import mongoose from 'mongoose';
import Dealer from './models/Dealer.js';
import dotenv from 'dotenv';

dotenv.config();

const getDealerId = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    const dealer = await Dealer.findOne();
    console.log('Dealer ID:', dealer._id.toString());
    console.log('Dealer Name:', dealer.name);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
};

getDealerId();