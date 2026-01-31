import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import models
import SalesOrder from './models/SalesOrder.js';
import DealerInvoice from './models/DealerInvoice.js';

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jainimpexcrm', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugSalesAnalyticsNotShowing() {
  try {
    console.log('🔍 Debugging Sales Analytics Not Showing Issue...\n');

    // Check recent sales orders
    console.log('📋 Checking Recent Sales Orders:');
    const recentSalesOrders = await SalesOrder.find({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).sort({ createdAt: -1 }).limit(5);

    console.log(`Found ${recentSalesOrders.length} recent sales orders:`);
    recentSalesOrders.forEach((order, index) => {
      console.log(`\n${index + 1}. Sales Order: ${order.orderNumber || order._id}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Created: ${order.createdAt}`);
      console.log(`   Products: ${order.products?.length || 0} items`);
      
      if (order.products && order.products.length > 0) {
        order.products.forEach((product, pIndex) => {
          console.log(`     Product ${pIndex + 1}: ID=${product.productId}, Qty=${product.quantity}`);
        });
      }
    });

    // Check recent dealer invoices
    console.log('\n📄 Checking Recent Dealer Invoices:');
    const recentInvoices = await DealerInvoice.find({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).sort({ createdAt: -1 }).limit(5);

    console.log(`Found ${recentInvoices.length} recent dealer invoices:`);
    recentInvoices.forEach((invoice, index) => {
      console.log(`\n${index + 1}. Invoice: ${invoice.invoiceNumber || invoice._id}`);
      console.log(`   Status: ${invoice.status}`);
      console.log(`   Created: ${invoice.createdAt}`);
      console.log(`   Products: ${invoice.products?.length || 0} items`);
      
      if (invoice.products && invoice.products.length > 0) {
        invoice.products.forEach((product, pIndex) => {
          console.log(`     Product ${pIndex + 1}: ID=${product.productId}, Qty=${product.quantity}`);
        });
      }
    });

    // Check status distribution
    console.log('\n📊 Sales Order Status Distribution:');
    const salesOrderStatuses = await SalesOrder.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    salesOrderStatuses.forEach(status => {
      console.log(`   ${status._id}: ${status.count} orders`);
    });

    console.log('\n📊 Dealer Invoice Status Distribution:');
    const invoiceStatuses = await DealerInvoice.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    invoiceStatuses.forEach(status => {
      console.log(`   ${status._id}: ${status.count} invoices`);
    });

    // Test sales analytics query for a specific product
    if (recentSalesOrders.length > 0 && recentSalesOrders[0].products && recentSalesOrders[0].products.length > 0) {
      const testProductId = recentSalesOrders[0].products[0].productId;
      console.log(`\n🧪 Testing Sales Analytics Query for Product: ${testProductId}`);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Test the exact query used in sales analytics
      const salesOrderResult = await SalesOrder.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo, $lte: now },
            status: { $in: ['confirmed', 'delivered', 'completed'] }
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.productId': testProductId.toString()
          }
        },
        {
          $group: {
            _id: '$products.productId',
            totalQuantity: { $sum: '$products.quantity' }
          }
        }
      ]);

      const dealerInvoiceResult = await DealerInvoice.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo, $lte: now },
            status: { $in: ['confirmed', 'delivered', 'completed'] }
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.productId': testProductId.toString()
          }
        },
        {
          $group: {
            _id: '$products.productId',
            totalQuantity: { $sum: '$products.quantity' }
          }
        }
      ]);

      console.log(`   Sales Order Analytics Result:`, salesOrderResult);
      console.log(`   Dealer Invoice Analytics Result:`, dealerInvoiceResult);

      const salesOrderQty = salesOrderResult[0]?.totalQuantity || 0;
      const dealerInvoiceQty = dealerInvoiceResult[0]?.totalQuantity || 0;
      const totalSales = salesOrderQty + dealerInvoiceQty;

      console.log(`   📈 Sales Order Quantity: ${salesOrderQty}`);
      console.log(`   📄 Dealer Invoice Quantity: ${dealerInvoiceQty}`);
      console.log(`   🎯 Total Sales (30 days): ${totalSales}`);

      // Check if there are any orders with different statuses
      console.log('\n🔍 Checking All Orders for This Product (Any Status):');
      const allOrdersForProduct = await SalesOrder.find({
        'products.productId': testProductId.toString(),
        createdAt: { $gte: thirtyDaysAgo, $lte: now }
      });

      console.log(`   Found ${allOrdersForProduct.length} orders with this product:`);
      allOrdersForProduct.forEach((order, index) => {
        console.log(`     ${index + 1}. Order: ${order.orderNumber || order._id}`);
        console.log(`        Status: ${order.status}`);
        console.log(`        Created: ${order.createdAt}`);
        const product = order.products.find(p => p.productId.toString() === testProductId.toString());
        console.log(`        Quantity: ${product?.quantity || 0}`);
      });

      const allInvoicesForProduct = await DealerInvoice.find({
        'products.productId': testProductId.toString(),
        createdAt: { $gte: thirtyDaysAgo, $lte: now }
      });

      console.log(`   Found ${allInvoicesForProduct.length} invoices with this product:`);
      allInvoicesForProduct.forEach((invoice, index) => {
        console.log(`     ${index + 1}. Invoice: ${invoice.invoiceNumber || invoice._id}`);
        console.log(`        Status: ${invoice.status}`);
        console.log(`        Created: ${invoice.createdAt}`);
        const product = invoice.products.find(p => p.productId.toString() === testProductId.toString());
        console.log(`        Quantity: ${product?.quantity || 0}`);
      });
    }

    // Check for common issues
    console.log('\n⚠️ Common Issues Check:');
    
    // Issue 1: Orders with wrong status
    const pendingOrders = await SalesOrder.countDocuments({
      status: { $nin: ['confirmed', 'delivered', 'completed'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    console.log(`   📋 Orders with non-analytics status (pending/draft): ${pendingOrders}`);

    // Issue 2: Invoices with wrong status
    const pendingInvoices = await DealerInvoice.countDocuments({
      status: { $nin: ['confirmed', 'delivered', 'completed'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    console.log(`   📄 Invoices with non-analytics status (pending/draft): ${pendingInvoices}`);

    // Issue 3: Orders without products
    const ordersWithoutProducts = await SalesOrder.countDocuments({
      $or: [
        { products: { $exists: false } },
        { products: { $size: 0 } }
      ],
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    console.log(`   📋 Orders without products: ${ordersWithoutProducts}`);

    // Issue 4: Invoices without products
    const invoicesWithoutProducts = await DealerInvoice.countDocuments({
      $or: [
        { products: { $exists: false } },
        { products: { $size: 0 } }
      ],
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    console.log(`   📄 Invoices without products: ${invoicesWithoutProducts}`);

    console.log('\n✅ Sales Analytics Debug Complete!');
    console.log('\n📋 Recommendations:');
    console.log('   1. Check if your sales orders/invoices have status "confirmed", "delivered", or "completed"');
    console.log('   2. Verify that products array exists and has valid productId fields');
    console.log('   3. Ensure createdAt dates are within the selected time period');
    console.log('   4. Check if productId in analytics query matches the actual productId in database');

  } catch (error) {
    console.error('❌ Error debugging sales analytics:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugSalesAnalyticsNotShowing();