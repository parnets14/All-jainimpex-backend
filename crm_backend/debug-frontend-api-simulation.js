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

const simulateFrontendAPICall = async () => {
  try {
    await connectDB();
    
    console.log('\n🔍 SIMULATING EXACT FRONTEND API CALL');
    console.log('='.repeat(50));
    
    // Simulate the exact parameters the frontend is sending
    const productId = '6979b839be2f2eaac8767ccd';
    const warehouseId = undefined; // Frontend doesn't send warehouse ID in the logs
    const period = '30days';
    const startDate = undefined;
    const endDate = undefined;
    
    console.log('📋 Request Parameters:');
    console.log('- productId:', productId);
    console.log('- warehouseId:', warehouseId);
    console.log('- period:', period);
    console.log('- startDate:', startDate);
    console.log('- endDate:', endDate);
    
    // Simulate the exact API logic from the detailed analytics route
    const now = new Date();
    console.log('\n📅 Current time:', now.toISOString());
    
    // Calculate different time periods (EXACT copy from API)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    console.log('\n📊 Calculated Date Ranges:');
    console.log('- 1 Day Ago:', oneDayAgo.toISOString());
    console.log('- 7 Days Ago:', sevenDaysAgo.toISOString());
    console.log('- 30 Days Ago:', oneMonthAgo.toISOString());
    console.log('- 3 Months Ago:', threeMonthsAgo.toISOString());
    console.log('- 6 Months Ago:', sixMonthsAgo.toISOString());
    console.log('- 1 Year Ago:', oneYearAgo.toISOString());

    // Handle custom date range (EXACT copy from API)
    let customStartDate = null;
    let customEndDate = null;
    if (period === 'custom' && startDate && endDate) {
      customStartDate = new Date(startDate);
      customEndDate = new Date(endDate);
      customEndDate.setHours(23, 59, 59, 999);
    }

    // Base match criteria (EXACT copy from API)
    const baseMatch = {
      'products.product': new mongoose.Types.ObjectId(productId.toString())
    };

    if (warehouseId) {
      baseMatch.warehouseId = warehouseId;
    }

    console.log('\n🔍 Base Match Criteria:');
    console.log(JSON.stringify(baseMatch, null, 2));

    // Helper function to get sales data for a period (EXACT copy from API)
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

    // Get sales for different periods (EXACT copy from API)
    console.log('\n📈 Calculating All Periods:');
    const [oneDaySales, sevenDaysSales, oneMonthSales, threeMonthsSales, sixMonthsSales, oneYearSales, totalSales, customPeriodSales] = await Promise.all([
      getSalesForPeriod(oneDayAgo),
      getSalesForPeriod(sevenDaysAgo),
      getSalesForPeriod(oneMonthAgo),
      getSalesForPeriod(threeMonthsAgo),
      getSalesForPeriod(sixMonthsAgo),
      getSalesForPeriod(oneYearAgo),
      getSalesForPeriod(new Date('2020-01-01')), // Total sales from a far back date
      customStartDate && customEndDate ? getSalesForPeriod(customStartDate, customEndDate) : 0
    ]);

    // Get monthly breakdown for the last 12 months (EXACT copy from API)
    console.log('\n📅 Calculating Monthly Breakdown:');
    const monthlyBreakdown = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthlySales = await getSalesForPeriod(monthStart, monthEnd);
      
      monthlyBreakdown.push({
        month: monthStart.toLocaleString('default', { month: 'short' }),
        year: monthStart.getFullYear(),
        quantity: monthlySales
      });
    }

    // Get yearly breakdown for the last 3 years (EXACT copy from API)
    console.log('\n📆 Calculating Yearly Breakdown:');
    const yearlyBreakdown = [];
    for (let i = 2; i >= 0; i--) {
      const yearStart = new Date(now.getFullYear() - i, 0, 1);
      const yearEnd = new Date(now.getFullYear() - i, 11, 31);
      
      const yearlySales = await getSalesForPeriod(yearStart, yearEnd);
      
      yearlyBreakdown.push({
        year: now.getFullYear() - i,
        quantity: yearlySales
      });
    }

    // Determine which data to return based on period (EXACT copy from API)
    let responseData = {
      oneDaySales,
      sevenDaysSales,
      oneMonthSales,
      threeMonthsSales,
      sixMonthsSales,
      oneYearSales,
      totalSales,
      monthlyBreakdown: monthlyBreakdown.filter(m => m.quantity > 0),
      yearlyBreakdown: yearlyBreakdown.filter(y => y.quantity > 0)
    };

    // Add custom period data if requested (EXACT copy from API)
    if (period === 'custom' && customStartDate && customEndDate) {
      responseData.customPeriodSales = customPeriodSales;
      responseData.customPeriod = {
        startDate: customStartDate.toISOString().split('T')[0],
        endDate: customEndDate.toISOString().split('T')[0],
        sales: customPeriodSales
      };
    }

    // Add period-specific insights (EXACT copy from API)
    switch (period) {
      case '3months':
        responseData.periodSales = threeMonthsSales;
        responseData.periodLabel = '3 Months';
        break;
      case '6months':
        responseData.periodSales = sixMonthsSales;
        responseData.periodLabel = '6 Months';
        break;
      case '1year':
        responseData.periodSales = oneYearSales;
        responseData.periodLabel = '1 Year';
        break;
      case 'custom':
        responseData.periodSales = customPeriodSales;
        responseData.periodLabel = 'Custom Period';
        break;
      default:
        responseData.periodSales = oneMonthSales;
        responseData.periodLabel = '30 Days';
    }

    console.log('\n🎯 FINAL API RESPONSE:');
    console.log('='.repeat(30));
    console.log(JSON.stringify(responseData, null, 2));

    // Compare with what frontend expects
    console.log('\n🔍 FRONTEND EXPECTATION CHECK:');
    console.log('='.repeat(30));
    console.log('Frontend expects oneMonthSales:', responseData.oneMonthSales);
    console.log('Frontend logs show oneMonthSales: 0');
    console.log('Match:', responseData.oneMonthSales === 0 ? '❌ MISMATCH!' : '✅ Match');

    // Check if there's any data at all
    const hasAnyData = Object.values(responseData).some(value => 
      typeof value === 'number' && value > 0
    );
    console.log('Has any sales data:', hasAnyData);

    if (!hasAnyData) {
      console.log('\n❌ NO SALES DATA FOUND - This matches the frontend issue!');
      console.log('Possible causes:');
      console.log('1. Date range calculation issue');
      console.log('2. Product ID format issue');
      console.log('3. Database query issue');
      console.log('4. Aggregation pipeline issue');
    } else {
      console.log('\n✅ Sales data found - Issue might be in API response handling');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

simulateFrontendAPICall();