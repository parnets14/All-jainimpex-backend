import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testLiveDetailedAnalytics = async () => {
  try {
    await connectDB();
    
    console.log('\n🔍 TESTING LIVE DETAILED ANALYTICS API ISSUE');
    console.log('='.repeat(60));
    
    const productId = '6979b839be2f2eaac8767ccd';
    const period = '30days';
    
    console.log('📋 Testing with exact frontend parameters:');
    console.log('- productId:', productId);
    console.log('- period:', period);
    console.log('- warehouseId: undefined');
    console.log('- startDate: undefined');
    console.log('- endDate: undefined');
    
    // Test the EXACT logic from the detailed analytics API
    const now = new Date();
    console.log('\n📅 Current time:', now.toISOString());
    
    // EXACT date calculation from detailed analytics API
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    console.log('\n📊 Date ranges (detailed API method):');
    console.log('- 1 Day Ago:', oneDayAgo.toISOString());
    console.log('- 7 Days Ago:', sevenDaysAgo.toISOString());
    console.log('- 30 Days Ago:', oneMonthAgo.toISOString());
    
    // Test the EXACT base match from detailed analytics API
    const baseMatch = {
      'products.product': new mongoose.Types.ObjectId(productId.toString())
    };
    
    console.log('\n🔍 Base match criteria (detailed API):');
    console.log(JSON.stringify(baseMatch, null, 2));
    
    // Test the EXACT getSalesForPeriod logic from detailed analytics API
    const getSalesForPeriod = async (startDate, endDate = now) => {
      const matchCriteria = {
        ...baseMatch,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      console.log(`\n🔍 Query for ${startDate.toISOString()} to ${endDate.toISOString()}:`);
      console.log('Match Criteria:', JSON.stringify(matchCriteria, null, 2));

      const salesOrderResult = await SalesOrder.aggregate([
        { $match: matchCriteria },
        { $unwind: '$products' },
        { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      console.log(`📊 Result: ${salesOrderQty} units`);
      
      return salesOrderQty;
    };
    
    // Test 30-day sales (what frontend is requesting)
    console.log('\n🎯 TESTING 30-DAY SALES (Frontend Request):');
    const oneMonthSales = await getSalesForPeriod(oneMonthAgo);
    
    console.log('\n📋 EXPECTED API RESPONSE:');
    const expectedResponse = {
      success: true,
      data: {
        oneDaySales: await getSalesForPeriod(oneDayAgo),
        sevenDaysSales: await getSalesForPeriod(sevenDaysAgo),
        oneMonthSales: oneMonthSales,
        periodSales: oneMonthSales,
        periodLabel: '30 Days'
      }
    };
    
    console.log(JSON.stringify(expectedResponse, null, 2));
    
    // Compare with bulk API method
    console.log('\n🔄 COMPARING WITH BULK API METHOD:');
    const endDate = new Date();
    let startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    console.log('Bulk API date range:');
    console.log('- Start:', startDate.toISOString());
    console.log('- End:', endDate.toISOString());
    
    const bulkMatchCriteria = {
      createdAt: { $gte: startDate, $lte: endDate }
    };
    
    const bulkResult = await SalesOrder.aggregate([
      { $match: bulkMatchCriteria },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': new mongoose.Types.ObjectId(productId.toString())
        }
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    const bulkQuantity = bulkResult[0]?.totalQuantity || 0;
    console.log('Bulk API result:', bulkQuantity, 'units');
    
    console.log('\n🔍 COMPARISON:');
    console.log('- Detailed API (30 days):', oneMonthSales, 'units');
    console.log('- Bulk API (30 days):', bulkQuantity, 'units');
    console.log('- Match:', oneMonthSales === bulkQuantity ? '✅ Same' : '❌ Different');
    
    if (oneMonthSales !== bulkQuantity) {
      console.log('\n❌ MISMATCH DETECTED!');
      console.log('This explains why detailed analytics shows different results.');
      
      // Check date differences
      const detailedStart = oneMonthAgo;
      const bulkStart = startDate;
      
      console.log('\n📅 Date Comparison:');
      console.log('Detailed API start:', detailedStart.toISOString());
      console.log('Bulk API start:', bulkStart.toISOString());
      console.log('Time difference (ms):', Math.abs(detailedStart.getTime() - bulkStart.getTime()));
      console.log('Time difference (hours):', Math.abs(detailedStart.getTime() - bulkStart.getTime()) / (1000 * 60 * 60));
    }
    
    // Check if there's a timezone or date boundary issue
    console.log('\n🌍 TIMEZONE ANALYSIS:');
    console.log('Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log('Current UTC offset:', new Date().getTimezoneOffset(), 'minutes');
    
    // Check all sales orders to see which ones fall in which ranges
    console.log('\n📋 ALL SALES ORDERS ANALYSIS:');
    const allOrders = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId.toString())
    }).select('orderNumber status createdAt products');
    
    console.log(`Found ${allOrders.length} orders:`);
    allOrders.forEach(order => {
      const productData = order.products.find(p => p.product.toString() === productId);
      const orderDate = order.createdAt;
      
      const inDetailedRange = orderDate >= oneMonthAgo && orderDate <= now;
      const inBulkRange = orderDate >= startDate && orderDate <= endDate;
      
      console.log(`- ${order.orderNumber}:`);
      console.log(`  Created: ${orderDate.toISOString()}`);
      console.log(`  Quantity: ${productData?.quantity || 0}`);
      console.log(`  In Detailed Range: ${inDetailedRange}`);
      console.log(`  In Bulk Range: ${inBulkRange}`);
      
      if (inDetailedRange !== inBulkRange) {
        console.log(`  ⚠️ RANGE MISMATCH!`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testLiveDetailedAnalytics();