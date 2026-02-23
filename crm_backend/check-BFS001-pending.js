import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';

dotenv.config();

const checkBFS001Pending = async () => {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find the product
    const product = await Product.findOne({ productCode: 'BFS001' }).lean();
    if (!product) {
      console.log('❌ Product BFS001 not found');
      process.exit(1);
    }

    console.log(`Product ID: ${product._id}\n`);

    // Check all sales orders with BFS001
    console.log('📋 ALL SALES ORDERS WITH BFS001:');
    console.log('='.repeat(80));
    
    const allOrders = await SalesOrder.find({
      'products.product': product._id
    })
    .lean();

    console.log(`Found ${allOrders.length} orders:\n`);
    
    allOrders.forEach((order, index) => {
      const bfs001Products = order.products.filter(p => {
        const prodId = p.product;
        return prodId && prodId.toString() === product._id.toString();
      });
      const totalQty = bfs001Products.reduce((sum, p) => sum + p.quantity, 0);
      
      console.log(`${index + 1}. ${order.salesOrderNo || order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   isOutOfStock: ${order.isOutOfStock || false}`);
      console.log(`   Quantity: ${totalQty}`);
      console.log(`   Dealer: ${order.dealer?.name || order.dealerName || 'N/A'}`);
      console.log(`   Date: ${order.orderDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log('');
    });

    // Check orders matching getPendingQuantities criteria
    console.log('\n📊 ORDERS MATCHING getPendingQuantities CRITERIA:');
    console.log('='.repeat(80));
    console.log('Criteria: isOutOfStock = true AND status = "Pending"\n');

    const pendingOutOfStockOrders = await SalesOrder.find({
      'products.product': product._id,
      isOutOfStock: true,
      status: 'Pending'
    })
    .lean();

    console.log(`Found ${pendingOutOfStockOrders.length} orders:\n`);
    
    let totalPendingQty = 0;
    pendingOutOfStockOrders.forEach((order, index) => {
      const bfs001Products = order.products.filter(p => {
        const prodId = p.product;
        return prodId && prodId.toString() === product._id.toString();
      });
      const totalQty = bfs001Products.reduce((sum, p) => sum + p.quantity, 0);
      totalPendingQty += totalQty;
      
      console.log(`${index + 1}. ${order.salesOrderNo || order.orderNumber}`);
      console.log(`   Quantity: ${totalQty}`);
      console.log(`   Dealer: ${order.dealer?.name || order.dealerName || 'N/A'}`);
      console.log('');
    });

    console.log(`\n✅ TOTAL PENDING QUANTITY: ${totalPendingQty} units`);

    // Check confirmed orders (these would be blocked)
    console.log('\n\n🔒 CONFIRMED ORDERS (BLOCKED STOCK):');
    console.log('='.repeat(80));
    console.log('Criteria: status = "Confirmed"\n');

    const confirmedOrders = await SalesOrder.find({
      'products.product': product._id,
      status: 'Confirmed'
    })
    .lean();

    console.log(`Found ${confirmedOrders.length} orders:\n`);
    
    let totalBlockedQty = 0;
    confirmedOrders.forEach((order, index) => {
      const bfs001Products = order.products.filter(p => {
        const prodId = p.product;
        return prodId && prodId.toString() === product._id.toString();
      });
      const totalQty = bfs001Products.reduce((sum, p) => sum + p.quantity, 0);
      totalBlockedQty += totalQty;
      
      console.log(`${index + 1}. ${order.salesOrderNo || order.orderNumber}`);
      console.log(`   Quantity: ${totalQty}`);
      console.log(`   Dealer: ${order.dealer?.name || order.dealerName || 'N/A'}`);
      console.log(`   isOutOfStock: ${order.isOutOfStock || false}`);
      console.log('');
    });

    console.log(`\n✅ TOTAL BLOCKED QUANTITY (from Confirmed orders): ${totalBlockedQty} units`);

    console.log('\n\n📊 SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Pending Out-of-Stock Orders: ${totalPendingQty} units`);
    console.log(`Confirmed Orders (Blocked):  ${totalBlockedQty} units`);
    console.log('');
    console.log('Image shows:');
    console.log(`  Pending Quantity: 121 units`);
    console.log(`  Blocked Quantity: 121 units`);
    console.log('');
    
    if (totalPendingQty === 121) {
      console.log('✅ Pending quantity matches image (121)');
    } else if (totalBlockedQty === 121) {
      console.log('⚠️  Blocked quantity matches image (121), but pending does not');
      console.log('    This suggests the image might be showing blocked quantity in the pending column');
    } else {
      console.log('❌ Neither matches the image value of 121');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkBFS001Pending();
