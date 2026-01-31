import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Test the exact API call that frontend makes for 30-day analytics
    const productId = '6979b839be2f2eaac8767ccd'; // product1 ObjectId
    
    console.log('🧪 Testing 30-Day Sales Analytics API Call...');
    console.log(`   Product ID: ${productId}`);
    
    // Calculate 30-day date range (same as API)
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    console.log(`   Current Date: ${now.toISOString()}`);
    console.log(`   30 Days Ago: ${oneMonthAgo.toISOString()}`);
    
    // Test the exact aggregation query from the API
    console.log('\n📊 Testing getSalesForPeriod function (30 days)...');
    
    const matchCriteria = {
      'products.product': new mongoose.Types.ObjectId(productId.toString()),
      createdAt: { $gte: oneMonthAgo, $lte: now }
    };
    
    console.log('   Match Criteria:', JSON.stringify(matchCriteria, null, 2));
    
    const salesOrderResult = await SalesOrder.aggregate([
      { $match: matchCriteria },
      { $unwind: '$products' },
      { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
      { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
    ]);
    
    console.log('   Sales Order Result:', JSON.stringify(salesOrderResult, null, 2));
    
    const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
    console.log(`   30-Day Sales Quantity: ${salesOrderQty}`);
    
    // Test different time periods
    console.log('\n🔍 Testing All Time Periods...');
    
    const periods = [
      { name: '1 Day', days: 1 },
      { name: '7 Days', days: 7 },
      { name: '30 Days', days: 30 },
      { name: '90 Days', days: 90 },
      { name: '180 Days', days: 180 },
      { name: '365 Days', days: 365 }
    ];
    
    for (const period of periods) {
      const startDate = new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000);
      
      const result = await SalesOrder.aggregate([
        { 
          $match: { 
            'products.product': new mongoose.Types.ObjectId(productId.toString()),
            createdAt: { $gte: startDate, $lte: now }
          } 
        },
        { $unwind: '$products' },
        { $match: { 'products.product': new mongoose.Types.ObjectId(productId.toString()) } },
        { $group: { _id: null, totalQuantity: { $sum: '$products.quantity' } } }
      ]);
      
      const quantity = result[0]?.totalQuantity || 0;
      console.log(`   ${period.name}: ${quantity} units`);
    }
    
    // Check all sales orders for this product
    console.log('\n📋 All Sales Orders for this product:');
    const allOrders = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId.toString())
    }).lean();
    
    allOrders.forEach(order => {
      const product = order.products.find(p => p.product.toString() === productId);
      console.log(`   Order: ${order.orderNumber}, Status: ${order.status}, Date: ${order.createdAt.toISOString().split('T')[0]}, Qty: ${product?.quantity || 0}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Test Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();