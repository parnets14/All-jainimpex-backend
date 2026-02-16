import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';

dotenv.config();

const fixDamagedStockMovements = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log(`\n🔧 Fixing damaged quantity stock movements...`);
    console.log('='.repeat(70));

    // Find all OUT movements with "Damaged Quantity" in remarks
    const damagedMovements = await StockMovement.find({
      type: 'OUT',
      remarks: { $regex: 'Damaged Quantity', $options: 'i' }
    }).populate('productId', 'productCode itemName');

    console.log(`\n📊 Found ${damagedMovements.length} damaged OUT movements to delete:`);
    
    for (const movement of damagedMovements) {
      console.log(`\n   Product: ${movement.productId?.productCode} - ${movement.productId?.itemName}`);
      console.log(`   Quantity: ${movement.quantity}`);
      console.log(`   Reference: ${movement.referenceNo}`);
      console.log(`   Date: ${new Date(movement.date).toLocaleString()}`);
    }

    if (damagedMovements.length > 0) {
      const result = await StockMovement.deleteMany({
        type: 'OUT',
        remarks: { $regex: 'Damaged Quantity', $options: 'i' }
      });

      console.log(`\n✅ Deleted ${result.deletedCount} damaged OUT movements`);
    } else {
      console.log(`\n✅ No damaged OUT movements found to delete`);
    }

    console.log(`\n💡 Explanation:`);
    console.log(`   Damaged quantity is part of received quantity (Received = Accepted + Damaged)`);
    console.log(`   Damaged items never enter usable stock, so no OUT movement should be created`);
    console.log(`   Only accepted quantity creates IN movement`);
    console.log(`   Damaged quantity is stored in GRN for record-keeping only`);

    console.log(`\n🔄 Now checking stock for product 15454636...`);
    
    const product = await Product.findOne({ productCode: '15454636' });
    if (product) {
      const movements = await StockMovement.find({
        productId: product._id
      }).sort({ date: 1 });

      console.log(`\n📊 Stock Movements for 15454636:`);
      movements.forEach((mov, i) => {
        console.log(`   ${i + 1}. ${mov.type} ${mov.quantity} - Balance: ${mov.balance} - ${mov.remarks}`);
      });

      if (movements.length > 0) {
        const finalBalance = movements[movements.length - 1].balance;
        console.log(`\n✅ Final Stock: ${finalBalance}`);
        console.log(`   This should now show correctly in the frontend!`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

fixDamagedStockMovements();
