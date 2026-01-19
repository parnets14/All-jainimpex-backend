import mongoose from 'mongoose';
import SalesOrder from './models/SalesOrder.js';
import DiscountMapping from './models/DiscountMapping.js';
import Dealer from './models/Dealer.js';

// Connect to MongoDB Atlas
mongoose.connect('mongodb+srv://parnetstech14:parnets14@jainimpexcrm.grb5bho.mongodb.net/?retryWrites=true&w=majority&appName=JainImpexCRM');

const findHighDiscountOrders = async () => {
  try {
    console.log('🔍 FINDING SALES ORDERS WITH HIGH DISCOUNTS');
    console.log('=' .repeat(50));
    
    // Find all sales orders with products having discount > 20%
    const salesOrders = await SalesOrder.find({
      'products.discountPercentage': { $gt: 20 }
    }).populate('dealer').sort({ createdAt: -1 }).limit(10);
    
    console.log(`📋 Found ${salesOrders.length} orders with discounts > 20%:`);
    console.log('');
    
    for (const order of salesOrders) {
      console.log(`📦 Order: ${order.salesOrderNumber || order._id}`);
      console.log(`   Dealer: ${order.dealer?.name || 'Unknown'}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt?.toLocaleDateString()}`);
      
      // Check products with high discounts
      const highDiscountProducts = order.products.filter(p => p.discountPercentage > 20);
      console.log(`   High Discount Products: ${highDiscountProducts.length}`);
      
      for (const product of highDiscountProducts) {
        console.log(`      - ${product.productName}: ${product.discountPercentage}%`);
        
        // Check if this product has a discount mapping with max limit
        const applicableDiscounts = await DiscountMapping.findApplicableDiscounts(
          product.product,
          'sales',
          order.dealer?.dealerType
        );
        
        if (applicableDiscounts.length > 0) {
          const maxLimit = applicableDiscounts[0].maxDiscountPercentage;
          console.log(`        Max Limit: ${maxLimit}%`);
          if (product.discountPercentage > maxLimit) {
            console.log(`        ⚠️ VIOLATION: Exceeds limit by ${product.discountPercentage - maxLimit}%`);
          }
        }
      }
      console.log('');
    }
    
    // Also check recent orders
    console.log('📅 RECENT SALES ORDERS (Last 10):');
    console.log('-'.repeat(40));
    
    const recentOrders = await SalesOrder.find({})
      .populate('dealer')
      .sort({ createdAt: -1 })
      .limit(10);
    
    for (const order of recentOrders) {
      const maxDiscount = Math.max(...order.products.map(p => p.discountPercentage || 0));
      console.log(`${order.salesOrderNumber || order._id} | ${order.dealer?.name || 'Unknown'} | Max Discount: ${maxDiscount}%`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
};

findHighDiscountOrders();