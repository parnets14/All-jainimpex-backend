import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const checkOrder44Stock = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find order SO-2026-0044
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0044' })
      .populate('products.product', 'itemName productCode')
      .populate('products.warehouse', 'name');

    if (!order) {
      console.log('❌ Order SO-2026-0044 not found');
      process.exit(1);
    }

    console.log('\n📋 ORDER INFORMATION:');
    console.log('='.repeat(80));
    console.log(`Order Number: ${order.orderNumber}`);
    console.log(`Status: ${order.status}`);
    console.log(`Dealer: ${order.dealerName}`);
    console.log(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
    console.log(`Total Amount: ₹${order.totalAmount?.toLocaleString()}`);

    console.log('\n📦 PRODUCTS IN ORDER:');
    console.log('='.repeat(80));
    order.products.forEach((p, index) => {
      console.log(`\n${index + 1}. ${p.productName || p.product?.itemName}`);
      console.log(`   Product ID: ${p.product?._id || p.product}`);
      console.log(`   Warehouse: ${p.warehouseName || p.warehouse?.name || p.warehouse}`);
      console.log(`   Quantity: ${p.quantity}`);
    });

    console.log('\n📊 STOCK MOVEMENTS FOR THIS ORDER:');
    console.log('='.repeat(80));
    
    const movements = await StockMovement.find({ 
      referenceNo: order.orderNumber 
    })
      .populate('productId', 'itemName productCode')
      .populate('warehouseId', 'name')
      .sort({ date: 1, createdAt: 1 });

    console.log(`Total Movements: ${movements.length}`);

    if (movements.length === 0) {
      console.log('❌ NO STOCK MOVEMENTS FOUND FOR THIS ORDER!');
      console.log('   This means stock was never blocked OR movements were deleted');
    } else {
      movements.forEach((m, index) => {
        console.log(`\n${index + 1}. ${m.type} Movement - ${new Date(m.date).toLocaleDateString()}`);
        console.log(`   Product: ${m.productId?.itemName || m.productId}`);
        console.log(`   Warehouse: ${m.warehouseId?.name || m.warehouseId}`);
        console.log(`   Quantity: ${m.quantity}`);
        console.log(`   Balance After: ${m.balance}`);
        console.log(`   Remarks: ${m.remarks}`);
      });
    }

    // Check if there are OUT movements without corresponding IN movements
    const outMovements = movements.filter(m => m.type === 'OUT');
    const inMovements = movements.filter(m => m.type === 'IN');

    console.log('\n🔍 MOVEMENT ANALYSIS:');
    console.log('='.repeat(80));
    console.log(`OUT Movements (Stock Blocked): ${outMovements.length}`);
    console.log(`IN Movements (Stock Restored): ${inMovements.length}`);

    if (outMovements.length > 0 && inMovements.length === 0) {
      console.log('\n❌ PROBLEM FOUND: Stock was blocked but NEVER restored!');
      console.log('   Order was cancelled but stock restoration did not happen.');
      
      console.log('\n💡 DETAILS OF BLOCKED STOCK:');
      outMovements.forEach((m, index) => {
        console.log(`\n${index + 1}. Product: ${m.productId?.itemName}`);
        console.log(`   Warehouse: ${m.warehouseId?.name}`);
        console.log(`   Blocked Quantity: ${m.quantity}`);
        console.log(`   Date Blocked: ${new Date(m.date).toLocaleDateString()}`);
      });
    } else if (outMovements.length === inMovements.length) {
      console.log('\n✅ Stock properly restored - OUT and IN movements match');
    } else {
      console.log('\n⚠️ Mismatch: Different number of OUT and IN movements');
    }

    // Check current stock status for the products
    console.log('\n📊 CURRENT STOCK STATUS:');
    console.log('='.repeat(80));
    
    for (const product of order.products) {
      const productId = product.product?._id || product.product;
      const warehouseId = product.warehouse?._id || product.warehouse;
      
      // Get latest movement for this product/warehouse
      const latestMovement = await StockMovement.findOne({
        productId: productId,
        warehouseId: warehouseId
      }).sort({ date: -1, createdAt: -1 });

      console.log(`\nProduct: ${product.productName || product.product?.itemName}`);
      console.log(`Warehouse: ${product.warehouseName || product.warehouse?.name}`);
      console.log(`Order Quantity: ${product.quantity}`);
      if (latestMovement) {
        console.log(`Current Balance: ${latestMovement.balance}`);
        console.log(`Last Movement: ${latestMovement.type} on ${new Date(latestMovement.date).toLocaleDateString()}`);
      } else {
        console.log(`Current Balance: No movements found`);
      }
    }

    console.log('\n✅ Analysis Complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkOrder44Stock();
