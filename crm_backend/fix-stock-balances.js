import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovementService from './services/stockMovementService.js';

dotenv.config();

const fixStockBalances = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log(`\n🔧 Recalculating all stock balances...`);
    console.log('='.repeat(70));

    // Use the built-in recalculate function
    await StockMovementService.recalculateBalances();

    console.log(`\n✅ Stock balances recalculated successfully!`);
    console.log(`\nNow test the stock display for product 15454636`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

fixStockBalances();
