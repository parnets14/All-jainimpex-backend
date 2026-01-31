import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Test the fixed sales analytics query
    const productIds = ['6979b839be2f2eaac8767ccd', '697b2ac00f3f5d530665d2c7']; // Our actual product ObjectIds
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    console.log('🧪 Testing Fixed Sales Analytics Query...');
    console.log(`   Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`   Product IDs: ${JSON.stringify(productIds)}`);
    
    // Test the fixed aggregation query
    const salesOrderData = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id.toString())) }
        }
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    console.log('\n📊 Sales Analytics Results:');
    console.log(JSON.stringify(salesOrderData, null, 2));
    
    // Format response like the API does
    const result = productIds.map(productId => ({
      productId: productId.toString(),
      totalQuantity: salesOrderData.find(item => item._id.toString() === productId.toString())?.totalQuantity || 0
    }));
    
    console.log('\n📋 Formatted API Response:');
    console.log(JSON.stringify(result, null, 2));
    
    // Test detailed analytics for first product
    console.log('\n🔍 Testing Detailed Analytics for first product...');
    const productId = productIds[0];
    
    const detailedResult = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
      { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
    ]);
    
    console.log(`   Product ${productId} detailed result:`, detailedResult);
    
    await mongoose.disconnect();
    console.log('\n✅ Test Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();