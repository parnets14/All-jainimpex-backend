import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

async function testWarehouseFilterFix() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productId = '6979b839be2f2eaac8767ccd';
    const warehouseId = '68e8f0283f5fd5a817866df6';

    console.log('\n🔍 Testing warehouse filter fix');
    console.log('Product ID:', productId);
    console.log('Warehouse ID:', warehouseId);

    // Test the new aggregation pipeline (same as in the fixed API)
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const matchCriteria = {
      'products.product': new mongoose.Types.ObjectId(productId.toString()),
      createdAt: { $gte: oneMonthAgo, $lte: now }
    };

    const aggregationPipeline = [
      { $match: matchCriteria },
      { $unwind: '$products' },
      { 
        $match: { 
          'products.product': new mongoose.Types.ObjectId(productId.toString())
        }
      }
    ];

    // Add warehouse filter at product level
    if (warehouseId) {
      aggregationPipeline.push({
        $match: {
          'products.warehouse': new mongoose.Types.ObjectId(warehouseId.toString())
        }
      });
    }

    // Add final grouping
    aggregationPipeline.push({
      $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } }
    });

    console.log('\n📊 Aggregation Pipeline:');
    console.log(JSON.stringify(aggregationPipeline, null, 2));

    const result = await SalesOrder.aggregate(aggregationPipeline);
    const totalQuantity = result[0]?.totalQuantity || 0;

    console.log('\n✅ Result:', totalQuantity, 'units');
    console.log('Expected: 20 units');
    console.log('Fix Status:', totalQuantity === 20 ? '✅ FIXED' : '❌ STILL BROKEN');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testWarehouseFilterFix();