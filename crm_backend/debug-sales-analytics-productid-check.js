import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get the specific order SO-2026-0003
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0003' }).lean();
    
    if (!order) {
      console.log('❌ Order SO-2026-0003 not found');
      return;
    }
    
    console.log('🔍 Order SO-2026-0003 Details:');
    console.log(`   - Status: "${order.status}"`);
    console.log(`   - Created: ${order.createdAt}`);
    console.log(`   - Products Array Length: ${order.products.length}`);
    
    order.products.forEach((product, index) => {
      console.log(`\n   Product ${index + 1}:`);
      console.log(`     - productId: "${product.productId}" (type: ${typeof product.productId})`);
      console.log(`     - productName: "${product.productName}"`);
      console.log(`     - quantity: ${product.quantity}`);
      console.log(`     - warehouseName: "${product.warehouseName}"`);
    });
    
    // Test the exact aggregation query that sales analytics uses
    console.log('\n🧪 Testing Sales Analytics Query...');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    console.log(`   Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Test for prod1
    console.log('\n   Testing for productId "prod1":');
    const prod1Result = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.productId': 'prod1'
        }
      },
      {
        $group: {
          _id: '$products.productId',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    console.log(`   Result: ${JSON.stringify(prod1Result, null, 2)}`);
    
    // Test for prod2
    console.log('\n   Testing for productId "prod2":');
    const prod2Result = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.productId': 'prod2'
        }
      },
      {
        $group: {
          _id: '$products.productId',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    console.log(`   Result: ${JSON.stringify(prod2Result, null, 2)}`);
    
    // Test with actual productIds from the database
    const actualProductIds = order.products.map(p => p.productId);
    console.log(`\n   Actual productIds in database: ${JSON.stringify(actualProductIds)}`);
    
    for (const productId of actualProductIds) {
      console.log(`\n   Testing for actual productId "${productId}":`)
      const result = await SalesOrder.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.productId': productId
          }
        },
        {
          $group: {
            _id: '$products.productId',
            totalQuantity: { $sum: '$products.quantity' }
          }
        }
      ]);
      
      console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Debug Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();