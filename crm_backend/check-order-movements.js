import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';

dotenv.config();

const checkOrderMovements = async () => {
  try {
    const mongoUri = process.env.MONGO_URL;
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check for movements related to order SO-2026-0035
    const orderNumber = 'SO-2026-0035';
    console.log(`\n🔍 Searching for StockMovement records for order: ${orderNumber}`);

    const movements = await StockMovement.find({
      referenceNo: orderNumber,
      referenceType: 'SALE'
    }).sort({ date: -1 });

    console.log(`\n📦 Found ${movements.length} SALE movements for ${orderNumber}:`);
    
    if (movements.length === 0) {
      console.log('❌ NO STOCK MOVEMENTS FOUND!');
      console.log('This means the order was confirmed but StockMovement records were not created.');
      console.log('\nPossible reasons:');
      console.log('1. Order was confirmed before StockMovement creation code was added');
      console.log('2. Error occurred during StockMovement creation');
      console.log('3. Order status is not actually "Confirmed"');
    } else {
      movements.forEach((movement, idx) => {
        console.log(`\n${idx + 1}. Movement:`);
        console.log(`   Type: ${movement.type}`);
        console.log(`   Quantity: ${movement.quantity}`);
        console.log(`   Product ID: ${movement.productId}`);
        console.log(`   Warehouse ID: ${movement.warehouseId}`);
        console.log(`   Balance: ${movement.balance}`);
        console.log(`   Date: ${movement.date.toISOString()}`);
        console.log(`   Remarks: ${movement.remarks}`);
      });
    }

    // Also check for ANY SALE movements to see if the system is working
    console.log('\n\n🔍 Checking for ANY SALE movements in the system...');
    const anySaleMovements = await StockMovement.find({
      referenceType: 'SALE'
    }).limit(5).sort({ date: -1 });

    console.log(`\n📦 Found ${anySaleMovements.length} recent SALE movements (showing last 5):`);
    anySaleMovements.forEach((movement, idx) => {
      console.log(`\n${idx + 1}. ${movement.referenceNo}:`);
      console.log(`   Type: ${movement.type} ${movement.quantity} units`);
      console.log(`   Remarks: ${movement.remarks}`);
      console.log(`   Date: ${movement.date.toISOString().split('T')[0]}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Test complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkOrderMovements();
