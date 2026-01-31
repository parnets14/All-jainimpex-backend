import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';

// Connect to MongoDB with shorter timeout
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jainimpexcrm');

async function checkRecentSalesData() {
  try {
    console.log('🔍 Checking Recent Sales Data...\n');

    // Get the most recent sales order
    console.log('📋 Most Recent Sales Order:');
    const latestSalesOrder = await SalesOrder.findOne().sort({ createdAt: -1 });
    
    if (latestSalesOrder) {
      console.log(`   Order ID: ${latestSalesOrder._id}`);
      console.log(`   Order Number: ${latestSalesOrder.orderNumber || 'N/A'}`);
      console.log(`   Status: ${latestSalesOrder.status}`);
      console.log(`   Created: ${latestSalesOrder.createdAt}`);
      console.log(`   Products Count: ${latestSalesOrder.products?.length || 0}`);
      
      if (latestSalesOrder.products && latestSalesOrder.products.length > 0) {
        console.log('   Products:');
        latestSalesOrder.products.forEach((product, index) => {
          console.log(`     ${index + 1}. Product ID: ${product.productId}`);
          console.log(`        Quantity: ${product.quantity}`);
          console.log(`        Item Name: ${product.itemName || 'N/A'}`);
        });
      }
    } else {
      console.log('   No sales orders found');
    }

    // Get the most recent dealer invoice
    console.log('\n📄 Most Recent Dealer Invoice:');
    const latestInvoice = await DealerInvoice.findOne().sort({ createdAt: -1 });
    
    if (latestInvoice) {
      console.log(`   Invoice ID: ${latestInvoice._id}`);
      console.log(`   Invoice Number: ${latestInvoice.invoiceNumber || 'N/A'}`);
      console.log(`   Status: ${latestInvoice.status}`);
      console.log(`   Created: ${latestInvoice.createdAt}`);
      console.log(`   Products Count: ${latestInvoice.products?.length || 0}`);
      
      if (latestInvoice.products && latestInvoice.products.length > 0) {
        console.log('   Products:');
        latestInvoice.products.forEach((product, index) => {
          console.log(`     ${index + 1}. Product ID: ${product.productId}`);
          console.log(`        Quantity: ${product.quantity}`);
          console.log(`        Item Name: ${product.itemName || 'N/A'}`);
        });
      }
    } else {
      console.log('   No dealer invoices found');
    }

    // Test analytics query with the most recent data
    if (latestSalesOrder && latestSalesOrder.products && latestSalesOrder.products.length > 0) {
      const testProductId = latestSalesOrder.products[0].productId;
      console.log(`\n🧪 Testing Analytics for Product ID: ${testProductId}`);
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Check if this order would be included in analytics
      const orderDate = new Date(latestSalesOrder.createdAt);
      const isWithinRange = orderDate >= thirtyDaysAgo && orderDate <= now;
      const hasValidStatus = ['confirmed', 'delivered', 'completed'].includes(latestSalesOrder.status);
      
      console.log(`   Order Date: ${orderDate}`);
      console.log(`   Within 30 days: ${isWithinRange}`);
      console.log(`   Valid Status: ${hasValidStatus} (${latestSalesOrder.status})`);
      console.log(`   Should appear in analytics: ${isWithinRange && hasValidStatus}`);
      
      if (!hasValidStatus) {
        console.log(`\n⚠️  ISSUE FOUND: Order status "${latestSalesOrder.status}" is not included in analytics`);
        console.log(`   Analytics only includes orders with status: confirmed, delivered, completed`);
        console.log(`   Your order needs to be confirmed/delivered/completed to show in analytics`);
      }
    }

    console.log('\n✅ Check Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

checkRecentSalesData();