import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import StockMovement from './models/Stock.js';

dotenv.config();

const checkStockMovements = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productCode = '15454636';
    
    console.log(`\n🔍 Checking Stock Movements for: ${productCode}`);
    console.log('='.repeat(70));

    // Find the product
    const product = await Product.findOne({ productCode });
    if (!product) {
      console.log(`❌ Product ${productCode} not found`);
      process.exit(1);
    }

    console.log(`\n✅ Product: ${product.itemName}`);

    // Get all stock movements
    const movements = await StockMovement.find({
      productId: product._id
    }).sort({ date: 1 }).lean(); // Sort by date ascending to see chronological order

    console.log(`\n📊 All Stock Movements (${movements.length}):`);
    movements.forEach((mov, i) => {
      console.log(`\n${i + 1}. Date: ${new Date(mov.date).toLocaleString()}`);
      console.log(`   Type: ${mov.type}`);
      console.log(`   Quantity: ${mov.quantity}`);
      console.log(`   Balance: ${mov.balance}`);
      console.log(`   Reference: ${mov.referenceType} - ${mov.referenceNo}`);
      console.log(`   Remarks: ${mov.remarks || 'No remarks'}`);
    });

    // Calculate what the balance should be
    console.log(`\n🔍 Balance Calculation:`);
    let calculatedBalance = 0;
    movements.forEach((mov, i) => {
      if (mov.type === 'IN') {
        calculatedBalance += mov.quantity;
      } else if (mov.type === 'OUT') {
        calculatedBalance -= mov.quantity;
      }
      console.log(`   After movement ${i + 1}: ${calculatedBalance} (recorded: ${mov.balance})`);
    });

    console.log(`\n✅ Final Balance:`);
    console.log(`   Calculated: ${calculatedBalance}`);
    console.log(`   Recorded (last movement): ${movements.length > 0 ? movements[movements.length - 1].balance : 0}`);

    if (calculatedBalance !== (movements.length > 0 ? movements[movements.length - 1].balance : 0)) {
      console.log(`\n⚠️  MISMATCH DETECTED!`);
      console.log(`   The recorded balance doesn't match the calculated balance.`);
      console.log(`   This indicates the stock movements need to be recalculated.`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

checkStockMovements();
