import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';
import User from './models/User.js';

dotenv.config();

const fixExistingOutOfStockOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find order SO-2026-0006
    console.log('🔍 Finding order SO-2026-0006...');
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0006' });

    if (!order) {
      console.log('❌ Order not found!');
      process.exit(1);
    }

    console.log('📋 Current Order State:');
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   isOutOfStock: ${order.isOutOfStock}`);
    console.log();

    // Update the order
    console.log('🔧 Updating order to set isOutOfStock = true...');
    order.isOutOfStock = true;
    order.status = 'Pending'; // Ensure status is Pending
    
    // Build stock validation from products
    order.stockValidation = order.products.map(product => ({
      productId: product.product,
      productName: product.productName,
      availableStock: 0,
      requestedQuantity: product.quantity,
      hasStock: false,
      shortfall: product.quantity,
      warehouseId: product.warehouse,
      warehouseName: product.warehouseName || 'No Stock'
    }));

    await order.save();

    console.log('✅ Order updated successfully!\n');

    console.log('📋 Updated Order State:');
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   isOutOfStock: ${order.isOutOfStock}`);
    console.log(`   Stock Validation Records: ${order.stockValidation.length}`);
    console.log();

    // Verify the order will now appear in pending quantities
    console.log('🔍 Verifying order will appear in pending quantities...');
    const pendingOrders = await SalesOrder.find({
      isOutOfStock: true,
      status: 'Pending'
    }).select('orderNumber').lean();

    console.log(`✅ Total out-of-stock pending orders: ${pendingOrders.length}`);
    pendingOrders.forEach(o => {
      console.log(`   - ${o.orderNumber}`);
    });

    console.log('\n✅ Fix completed successfully!');
    console.log('   The order should now appear in the Stock module pending quantities section.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixExistingOutOfStockOrder();
