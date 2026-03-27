import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Stock from './models/Stock.js';

dotenv.config();

const checkOrders = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find orders 44 and 45
    const order44 = await SalesOrder.findOne({ orderNumber: /SO-.*-0044/ }).lean();
    const order45 = await SalesOrder.findOne({ orderNumber: /SO-.*-0045/ }).lean();

    if (!order44) {
      console.log('❌ Order 44 not found');
    } else {
      console.log('📋 ORDER 44:');
      console.log('='.repeat(80));
      console.log(`Order Number: ${order44.orderNumber}`);
      console.log(`Status: ${order44.status}`);
      console.log(`Dealer: ${order44.dealerName || order44.dealer}`);
      console.log(`Order Date: ${new Date(order44.orderDate).toLocaleDateString()}`);
      console.log(`\nProducts:`);
      order44.products.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.productName || p.product}`);
        console.log(`     Quantity: ${p.quantity}`);
        console.log(`     Warehouse: ${p.warehouseName || p.warehouse}`);
        console.log(`     Product ID: ${p.product}`);
      });
    }

    if (!order45) {
      console.log('\n❌ Order 45 not found');
    } else {
      console.log('\n📋 ORDER 45:');
      console.log('='.repeat(80));
      console.log(`Order Number: ${order45.orderNumber}`);
      console.log(`Status: ${order45.status}`);
      console.log(`Dealer: ${order45.dealerName || order45.dealer}`);
      console.log(`Order Date: ${new Date(order45.orderDate).toLocaleDateString()}`);
      console.log(`\nProducts:`);
      order45.products.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.productName || p.product}`);
        console.log(`     Quantity: ${p.quantity}`);
        console.log(`     Warehouse: ${p.warehouseName || p.warehouse}`);
        console.log(`     Product ID: ${p.product}`);
      });
    }

    // Check if they have common products
    if (order44 && order45) {
      console.log('\n🔍 CHECKING FOR COMMON PRODUCTS:');
      console.log('='.repeat(80));
      
      const order44ProductIds = order44.products.map(p => p.product.toString());
      const order45ProductIds = order45.products.map(p => p.product.toString());
      
      const commonProducts = order44ProductIds.filter(id => order45ProductIds.includes(id));
      
      if (commonProducts.length > 0) {
        console.log(`Found ${commonProducts.length} common product(s):\n`);
        
        for (const productId of commonProducts) {
          const p44 = order44.products.find(p => p.product.toString() === productId);
          const p45 = order45.products.find(p => p.product.toString() === productId);
          
          console.log(`Product: ${p44.productName || productId}`);
          console.log(`  Order 44: ${p44.quantity} units in ${p44.warehouseName || p44.warehouse}`);
          console.log(`  Order 45: ${p45.quantity} units in ${p45.warehouseName || p45.warehouse}`);
          
          // Check stock movements for this product
          console.log(`\n  📦 Stock Movements for this product:`);
          const movements = await Stock.find({
            productId: productId,
            $or: [
              { referenceNo: order44.orderNumber },
              { referenceNo: order45.orderNumber }
            ]
          }).sort({ date: 1, createdAt: 1 }).lean();
          
          if (movements.length === 0) {
            console.log(`     ❌ No stock movements found for orders 44 or 45`);
          } else {
            movements.forEach((m, i) => {
              console.log(`     ${i + 1}. ${m.type} - ${m.quantity} units - Balance: ${m.balance}`);
              console.log(`        Date: ${new Date(m.date).toLocaleString()}`);
              console.log(`        Reference: ${m.referenceNo}`);
              console.log(`        Remarks: ${m.remarks}`);
            });
          }
          
          // Check current stock balance
          const latestMovement = await Stock.findOne({
            productId: productId,
            warehouseId: p44.warehouse
          }).sort({ date: -1, createdAt: -1 }).lean();
          
          console.log(`\n  💰 Current Stock Balance: ${latestMovement ? latestMovement.balance : 'Unknown'}`);
          console.log('');
        }
      } else {
        console.log('No common products between orders 44 and 45');
      }
    }

    // Check if order 44 was cancelled and stock was released
    if (order44 && order44.status === 'Cancelled') {
      console.log('\n⚠️ ORDER 44 IS CANCELLED - CHECKING STOCK RELEASE:');
      console.log('='.repeat(80));
      
      for (const product of order44.products) {
        console.log(`\nProduct: ${product.productName || product.product}`);
        console.log(`Warehouse: ${product.warehouseName || product.warehouse}`);
        console.log(`Quantity that should be released: ${product.quantity}`);
        
        // Find OUT movement (stock block)
        const outMovement = await Stock.findOne({
          productId: product.product,
          warehouseId: product.warehouse,
          referenceNo: order44.orderNumber,
          type: 'OUT'
        }).lean();
        
        if (outMovement) {
          console.log(`✅ Found OUT movement (stock block): ${outMovement.quantity} units`);
          console.log(`   Date: ${new Date(outMovement.date).toLocaleString()}`);
          console.log(`   Remarks: ${outMovement.remarks}`);
        } else {
          console.log(`❌ No OUT movement found for this product`);
        }
        
        // Find IN movement (stock release)
        const inMovement = await Stock.findOne({
          productId: product.product,
          warehouseId: product.warehouse,
          referenceNo: order44.orderNumber,
          type: 'IN'
        }).lean();
        
        if (inMovement) {
          console.log(`✅ Found IN movement (stock release): ${inMovement.quantity} units`);
          console.log(`   Date: ${new Date(inMovement.date).toLocaleString()}`);
          console.log(`   Remarks: ${inMovement.remarks}`);
        } else {
          console.log(`❌ NO IN MOVEMENT FOUND - STOCK WAS NOT RELEASED!`);
          console.log(`   This is the bug! Stock is still blocked.`);
        }
      }
    }

    console.log('\n✅ Analysis Complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

checkOrders();
