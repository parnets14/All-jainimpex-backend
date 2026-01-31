import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

// Simulate the exact logic from the sales analytics API
const testSalesAnalyticsLogic = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Test 1: Multiple products endpoint logic
    console.log('\n🧪 Testing Multiple Products Endpoint Logic...');
    
    const productIds = ['6979b839be2f2eaac8767ccd', '697b2ac00f3f5d530665d2c7'];
    const period = '30days';
    
    console.log(`   Product IDs: ${JSON.stringify(productIds)}`);
    console.log(`   Period: ${period}`);
    
    const productIdArray = Array.isArray(productIds) ? productIds : [productIds];
    
    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1day':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '3months':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '6months':
        startDate.setDate(endDate.getDate() - 180);
        break;
      case '1year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
        break;
    }
    
    console.log(`   Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Aggregate sales data from SalesOrder collection only
    const salesOrderData = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': { $in: productIdArray.map(id => new mongoose.Types.ObjectId(id.toString())) }
        }
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    console.log('   Sales Order Data:', JSON.stringify(salesOrderData, null, 2));
    
    // Format response
    const result = productIdArray.map(productId => ({
      productId: productId.toString(),
      totalQuantity: salesOrderData.find(item => item._id.toString() === productId.toString())?.totalQuantity || 0
    }));
    
    console.log('   Final Result:', JSON.stringify(result, null, 2));
    
    // Test 2: Detailed analytics for single product
    console.log('\n🧪 Testing Detailed Analytics Logic...');
    
    const productId = '6979b839be2f2eaac8767ccd';
    console.log(`   Product ID: ${productId}`);
    
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Helper function to get sales for a period
    const getSalesForPeriod = async (startDate, endDate = now) => {
      const matchCriteria = {
        'products.product': new mongoose.Types.ObjectId(productId.toString()),
        createdAt: { $gte: startDate, $lte: endDate }
      };

      const salesOrderResult = await SalesOrder.aggregate([
        { $match: matchCriteria },
        { $unwind: '$products' },
        { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      return salesOrderQty;
    };
    
    const oneMonthSales = await getSalesForPeriod(oneMonthAgo);
    console.log(`   30-Day Sales: ${oneMonthSales}`);
    
    const responseData = {
      oneMonthSales,
      periodSales: oneMonthSales,
      periodLabel: '30 Days'
    };
    
    console.log('   Detailed Response:', JSON.stringify(responseData, null, 2));
    
    await mongoose.disconnect();
    console.log('\n✅ Test Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

testSalesAnalyticsLogic();