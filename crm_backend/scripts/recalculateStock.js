import mongoose from 'mongoose';
import StockMovementService from '../services/stockMovementService.js';
import StockMovement from '../models/Stock.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crm_backend');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const recalculateStock = async () => {
  try {
    console.log('🔍 Starting stock balance recalculation...');
    
    // Recalculate all balances
    await StockMovementService.recalculateBalances();
    
    console.log('✅ Stock balance recalculation completed successfully');
    
    // Show some sample data
    const sampleMovements = await StockMovement.find({})
      .populate('productId', 'productCode itemName')
      .populate('warehouseId', 'name')
      .sort({ date: -1 })
      .limit(5);
    
    console.log('📊 Sample movements after recalculation:');
    sampleMovements.forEach((movement, index) => {
      console.log(`${index + 1}. ${movement.productId?.productCode} - ${movement.warehouseId?.name} - ${movement.type} ${movement.quantity} (Balance: ${movement.balance})`);
    });
    
  } catch (error) {
    console.error('❌ Error recalculating stock balances:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the recalculation
connectDB().then(() => {
  recalculateStock();
});
