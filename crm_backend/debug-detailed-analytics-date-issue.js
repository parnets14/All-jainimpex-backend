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

const debugDetailedAnalytics = async () => {
  try {
    await connectDB();
    
    const productId = '6979b839be2f2eaac8767ccd'; // Product 1 from the logs
    
    console.log('\n🔍 DEBUGGING DETAILED ANALYTICS DATE ISSUE');
    console.log('='.repeat(50));
    
    // Check current date and time
    const now = new Date();
    console.log('📅 Current Date/Time:', now.toISOString());
    
    // Calculate date ranges like the API does
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    console.log('\n📊 Date Ranges:');
    console.log('1 Day Ago:', oneDayAgo.toISOString());
    console.log('7 Days Ago:', sevenDaysAgo.toISOString());
    console.log('30 Days Ago:', oneMonthAgo.toISOString());
    
    // Find all sales orders for this product
    console.log('\n🔍 Finding all sales orders for product:', productId);
    
    const allOrders = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId)
    }).select('orderNumber status createdAt products');
    
    console.log(`\n📋 Found ${allOrders.length} sales orders:`);
    allOrders.forEach(order => {
      const productData = order.products.find(p => p.product.toString() === productId);
      console.log(`- ${order.orderNumber}: Status=${order.status}, Created=${order.createdAt.toISOString()}, Qty=${productData?.quantity || 0}`);
    });
    
    // Test different date ranges
    console.log('\n🧪 Testing Date Range Queries:');
    
    // Test 1: All orders (no date filter)
    const allOrdersAgg = await SalesOrder.aggregate([
      { $unwind: '$products' },
      {
        $match: {
          'products.product': new mongoose.Types.ObjectId(productId)
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    console.log('All Orders (no date filter):', allOrdersAgg[0]?.totalQuantity || 0);
    
    // Test 2: 30 days with date filter
    const thirtyDayOrders = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: oneMonthAgo, $lte: now }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': new mongoose.Types.ObjectId(productId)
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    console.log('30 Days (with date filter):', thirtyDayOrders[0]?.totalQuantity || 0);
    
    // Test 3: Check if orders are within date range
    console.log('\n📅 Order Date Analysis:');
    allOrders.forEach(order => {
      const orderDate = order.createdAt;
      const isWithin30Days = orderDate >= oneMonthAgo && orderDate <= now;
      const isWithin7Days = orderDate >= sevenDaysAgo && orderDate <= now;
      const isWithin1Day = orderDate >= oneDayAgo && orderDate <= now;
      
      console.log(`${order.orderNumber}:`);
      console.log(`  Created: ${orderDate.toISOString()}`);
      console.log(`  Within 1 day: ${isWithin1Day}`);
      console.log(`  Within 7 days: ${isWithin7Days}`);
      console.log(`  Within 30 days: ${isWithin30Days}`);
    });
    
    // Test 4: Simulate the exact API query for 30 days
    console.log('\n🔬 Simulating Exact API Query (30 days):');
    const endDate = new Date();
    let startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    console.log('API Start Date:', startDate.toISOString());
    console.log('API End Date:', endDate.toISOString());
    
    const apiSimulation = await SalesOrder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': new mongoose.Types.ObjectId(productId)
        }
      },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$products.quantity' }
        }
      }
    ]);
    console.log('API Simulation Result:', apiSimulation[0]?.totalQuantity || 0);
    
    // Test 5: Check timezone issues
    console.log('\n🌍 Timezone Analysis:');
    console.log('Server Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log('Server UTC Offset:', new Date().getTimezoneOffset());
    
    // Test with different date creation methods
    const startDateAlt1 = new Date();
    startDateAlt1.setUTCDate(startDateAlt1.getUTCDate() - 30);
    
    const startDateAlt2 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    console.log('Method 1 (setDate):', startDate.toISOString());
    console.log('Method 2 (setUTCDate):', startDateAlt1.toISOString());
    console.log('Method 3 (timestamp):', startDateAlt2.toISOString());
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugDetailedAnalytics();