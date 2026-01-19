import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import Dealer from './models/Dealer.js';

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

const checkAllSalesOrders = async () => {
  try {
    console.log('🔍 CHECKING ALL SALES ORDERS');
    console.log('=' .repeat(50));
    
    // Get total count
    const totalCount = await SalesOrder.countDocuments();
    console.log(`📊 Total Sales Orders: ${totalCount}`);
    
    // Find all sales orders
    const salesOrders = await SalesOrder.find({})
      .populate('dealer')
      .sort({ createdAt: -1 });
    
    console.log('\n📋 ALL SALES ORDERS:');
    console.log('-'.repeat(80));
    
    for (const order of salesOrders) {
      const maxDiscount = Math.max(...order.products.map(p => p.discountPercentage || 0));
      const totalDiscount = order.products.reduce((sum, p) => sum + (p.discountPercentage || 0), 0);
      
      console.log(`📦 ${order.salesOrderNumber || order._id}`);
      console.log(`   Dealer: ${order.dealer?.name || 'Unknown'}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt?.toLocaleDateString()}`);
      console.log(`   Products: ${order.products.length}`);
      console.log(`   Max Discount: ${maxDiscount}%`);
      console.log(`   Total Discount: ${totalDiscount}%`);
      
      // Check for any products with multiple level selections or high discounts
      const suspiciousProducts = order.products.filter(p => 
        p.discountPercentage > 15 || 
        p.selectedDiscountLevel || 
        p.appliedDiscount
      );
      
      if (suspiciousProducts.length > 0) {
        console.log(`   🎯 Products with discounts:`);
        for (const product of suspiciousProducts) {
          console.log(`      - ${product.productName}: ${product.discountPercentage}%`);
          if (product.selectedDiscountLevel) {
            console.log(`        Selected Level: ${product.selectedDiscountLevel}`);
          }
          if (product.appliedDiscount) {
            console.log(`        Applied Discount: ${JSON.stringify(product.appliedDiscount)}`);
          }
        }
      }
      console.log('');
    }
    
    // Search for any orders containing "SO-2026" pattern
    console.log('\n🔍 SEARCHING FOR SO-2026 PATTERN:');
    console.log('-'.repeat(40));
    
    const pattern2026Orders = await SalesOrder.find({
      salesOrderNumber: { $regex: /SO-2026/i }
    }).populate('dealer');
    
    if (pattern2026Orders.length > 0) {
      console.log(`Found ${pattern2026Orders.length} orders with SO-2026 pattern:`);
      for (const order of pattern2026Orders) {
        console.log(`   ${order.salesOrderNumber} | ${order.dealer?.name} | ${order.status}`);
      }
    } else {
      console.log('No orders found with SO-2026 pattern');
    }
    
    // Check for any orders with discount > 20%
    console.log('\n🚨 CHECKING FOR HIGH DISCOUNT ORDERS:');
    console.log('-'.repeat(40));
    
    const highDiscountOrders = await SalesOrder.find({
      $or: [
        { 'products.discountPercentage': { $gt: 20 } },
        { 'products.discountAmount': { $gt: 1000 } }
      ]
    }).populate('dealer');
    
    if (highDiscountOrders.length > 0) {
      console.log(`Found ${highDiscountOrders.length} orders with high discounts:`);
      for (const order of highDiscountOrders) {
        const maxDiscount = Math.max(...order.products.map(p => p.discountPercentage || 0));
        console.log(`   ${order.salesOrderNumber || order._id} | ${order.dealer?.name} | Max: ${maxDiscount}%`);
      }
    } else {
      console.log('No orders found with discounts > 20%');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
};

checkAllSalesOrders();