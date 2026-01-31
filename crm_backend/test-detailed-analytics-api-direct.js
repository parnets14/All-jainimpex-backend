import express from 'express';
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

const testDetailedAnalyticsAPI = async () => {
  try {
    await connectDB();
    
    const productId = '6979b839be2f2eaac8767ccd'; // Product 1 from the logs
    
    console.log('\n🔍 TESTING DETAILED ANALYTICS API DIRECTLY');
    console.log('='.repeat(50));
    console.log('Product ID:', productId);
    
    // Simulate the exact API logic from routes/salesAnalyticsRoutes.js
    const now = new Date();
    
    // Calculate different time periods based on period parameter
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Base match criteria (removed status filter to show all orders)
    const baseMatch = {
      'products.product': new mongoose.Types.ObjectId(productId.toString())
    };

    console.log('\n📊 Base Match Criteria:', JSON.stringify(baseMatch, null, 2));

    // Helper function to get sales data for a period (Sales Orders only)
    const getSalesForPeriod = async (startDate, endDate = now) => {
      const matchCriteria = {
        ...baseMatch,
        createdAt: { $gte: startDate, $lte: endDate }
      };

      console.log(`\n🔍 Query for period ${startDate.toISOString()} to ${endDate.toISOString()}:`);
      console.log('Match Criteria:', JSON.stringify(matchCriteria, null, 2));

      const salesOrderResult = await SalesOrder.aggregate([
        { $match: matchCriteria },
        { $unwind: '$products' },
        { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      console.log(`Result: ${salesOrderQty} units`);
      
      return salesOrderQty;
    };

    // Get sales for different periods
    console.log('\n📈 Testing All Time Periods:');
    
    const oneDaySales = await getSalesForPeriod(oneDayAgo);
    const sevenDaysSales = await getSalesForPeriod(sevenDaysAgo);
    const oneMonthSales = await getSalesForPeriod(oneMonthAgo);
    const threeMonthsSales = await getSalesForPeriod(threeMonthsAgo);
    const sixMonthsSales = await getSalesForPeriod(sixMonthsAgo);
    const oneYearSales = await getSalesForPeriod(oneYearAgo);
    const totalSales = await getSalesForPeriod(new Date('2020-01-01'));

    console.log('\n📊 FINAL RESULTS:');
    console.log('='.repeat(30));
    console.log('1 Day Sales:', oneDaySales);
    console.log('7 Days Sales:', sevenDaysSales);
    console.log('30 Days Sales:', oneMonthSales);
    console.log('3 Months Sales:', threeMonthsSales);
    console.log('6 Months Sales:', sixMonthsSales);
    console.log('1 Year Sales:', oneYearSales);
    console.log('Total Sales:', totalSales);

    // Get monthly breakdown for the last 12 months
    console.log('\n📅 Monthly Breakdown:');
    const monthlyBreakdown = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthlySales = await getSalesForPeriod(monthStart, monthEnd);
      
      if (monthlySales > 0) {
        monthlyBreakdown.push({
          month: monthStart.toLocaleString('default', { month: 'short' }),
          year: monthStart.getFullYear(),
          quantity: monthlySales
        });
        console.log(`${monthStart.toLocaleString('default', { month: 'short' })} ${monthStart.getFullYear()}: ${monthlySales} units`);
      }
    }

    // Construct the response object like the API does
    const responseData = {
      oneDaySales,
      sevenDaysSales,
      oneMonthSales,
      threeMonthsSales,
      sixMonthsSales,
      oneYearSales,
      totalSales,
      monthlyBreakdown: monthlyBreakdown.filter(m => m.quantity > 0),
      periodSales: oneMonthSales,
      periodLabel: '30 Days'
    };

    console.log('\n🎯 API RESPONSE OBJECT:');
    console.log(JSON.stringify(responseData, null, 2));

    // Test with different period parameter
    console.log('\n🧪 Testing Period-Specific Response:');
    const period = '30days';
    let periodSpecificResponse = { ...responseData };
    
    switch (period) {
      case '3months':
        periodSpecificResponse.periodSales = threeMonthsSales;
        periodSpecificResponse.periodLabel = '3 Months';
        break;
      case '6months':
        periodSpecificResponse.periodSales = sixMonthsSales;
        periodSpecificResponse.periodLabel = '6 Months';
        break;
      case '1year':
        periodSpecificResponse.periodSales = oneYearSales;
        periodSpecificResponse.periodLabel = '1 Year';
        break;
      default:
        periodSpecificResponse.periodSales = oneMonthSales;
        periodSpecificResponse.periodLabel = '30 Days';
    }

    console.log('Period-Specific Response for "30days":');
    console.log(JSON.stringify(periodSpecificResponse, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testDetailedAnalyticsAPI();