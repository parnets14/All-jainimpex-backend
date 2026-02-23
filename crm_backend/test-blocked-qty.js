import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';

dotenv.config();

const testBlockedQuantity = async () => {
  try {
    const mongoUri = process.env.MONGO_URL;
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find a product with SALE movements
    const saleMovements = await StockMovement.find({
      referenceType: 'SALE'
    }).limit(10);

    console.log('\n📦 Sample SALE movements:');
    saleMovements.forEach(movement => {
      console.log(`  - Product ${movement.productId}: ${movement.type} ${movement.quantity} units (${movement.remarks})`);
    });

    // Calculate blocked quantity for a specific product
    if (saleMovements.length > 0) {
      const testProduct = saleMovements[0].productId;
      const testWarehouse = saleMovements[0].warehouseId;

      console.log(`\n🔍 Calculating blocked quantity for product ${testProduct} in warehouse ${testWarehouse}`);

      const blockedResult = await StockMovement.aggregate([
        {
          $match: {
            productId: testProduct,
            warehouseId: testWarehouse,
            referenceType: 'SALE'
          }
        },
        {
          $group: {
            _id: '$type',
            totalQuantity: { $sum: '$quantity' }
          }
        }
      ]);

      let blockedQty = 0;
      blockedResult.forEach(result => {
        console.log(`  ${result._id}: ${result.totalQuantity}`);
        if (result._id === 'OUT') {
          blockedQty += result.totalQuantity;
        } else if (result._id === 'IN') {
          blockedQty -= result.totalQuantity;
        }
      });

      console.log(`\n✅ Blocked Quantity: ${blockedQty}`);

      // Show all SALE movements for this product
      const allSaleMovements = await StockMovement.find({
        productId: testProduct,
        warehouseId: testWarehouse,
        referenceType: 'SALE'
      }).sort({ date: -1 });

      console.log(`\n📋 All SALE movements for this product:`);
      allSaleMovements.forEach(movement => {
        console.log(`  ${movement.date.toISOString().split('T')[0]} - ${movement.type} ${movement.quantity} units - ${movement.remarks}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Test complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testBlockedQuantity();
