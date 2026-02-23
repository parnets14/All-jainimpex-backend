import mongoose from 'mongoose';
import dotenv from 'dotenv';
import StockMovement from './models/Stock.js';

dotenv.config();

const testBlockedQuantityFix = async () => {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test data - use actual IDs from your system
    const testProductId = new mongoose.Types.ObjectId('6980d8ed47673d095ce1cf10'); // 15454636
    const testWarehouseId = '68e8f0283f5fd5a817866df6'; // Jain Impex Hub

    console.log('\n🔍 Testing blocked quantity aggregation...');
    console.log(`Product ID: ${testProductId}`);
    console.log(`Warehouse ID: ${testWarehouseId} (type: ${typeof testWarehouseId})`);

    // Test 1: Query with string warehouseId (OLD - should return empty)
    console.log('\n--- Test 1: Query with STRING warehouseId (OLD WAY) ---');
    const resultWithString = await StockMovement.aggregate([
      {
        $match: {
          productId: testProductId,
          warehouseId: testWarehouseId, // String
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
    console.log('Result with string:', JSON.stringify(resultWithString, null, 2));

    // Test 2: Query with ObjectId warehouseId (NEW - should return results)
    console.log('\n--- Test 2: Query with OBJECTID warehouseId (NEW WAY) ---');
    const resultWithObjectId = await StockMovement.aggregate([
      {
        $match: {
          productId: testProductId,
          warehouseId: new mongoose.Types.ObjectId(testWarehouseId), // ObjectId
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
    console.log('Result with ObjectId:', JSON.stringify(resultWithObjectId, null, 2));

    // Calculate blocked quantity
    let blockedQty = 0;
    resultWithObjectId.forEach(result => {
      if (result._id === 'OUT') {
        blockedQty += result.totalQuantity;
      } else if (result._id === 'IN') {
        blockedQty -= result.totalQuantity;
      }
    });
    blockedQty = Math.max(0, blockedQty);

    console.log(`\n✅ Calculated blocked quantity: ${blockedQty}`);

    // Test 3: Verify StockMovement records exist
    console.log('\n--- Test 3: Verify StockMovement records exist ---');
    const allMovements = await StockMovement.find({
      productId: testProductId,
      warehouseId: new mongoose.Types.ObjectId(testWarehouseId),
      referenceType: 'SALE'
    }).lean();
    
    console.log(`Found ${allMovements.length} SALE movements for this product/warehouse`);
    allMovements.forEach(mov => {
      console.log(`  - ${mov.type}: ${mov.quantity} units (Ref: ${mov.referenceNo})`);
    });

    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testBlockedQuantityFix();
