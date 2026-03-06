/**
 * RESTORE STOCK FOR SO-2026-0035
 * Manually restore stock that was blocked but not unblocked when order was cancelled
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import StockMovement from './models/Stock.js';
import Product from './models/Product.js';
import Warehouse from './models/Warehouse.js';

async function restoreStock() {
  try {
    console.log('🔧 Restoring stock for SO-2026-0035...\n');
    
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to database\n');
    
    const orderNumber = 'SO-2026-0035';
    
    // Find the OUT movement that blocked the stock
    const outMovement = await StockMovement.findOne({ 
      referenceNo: orderNumber,
      type: 'OUT'
    }).lean();
    
    if (!outMovement) {
      console.log('❌ No OUT movement found for this order');
      return;
    }
    
    console.log('📄 FOUND BLOCKED STOCK:');
    console.log('='.repeat(80));
    console.log(`Product ID: ${outMovement.productId}`);
    console.log(`Warehouse ID: ${outMovement.warehouseId}`);
    console.log(`Quantity Blocked: ${outMovement.quantity}`);
    console.log(`Balance After Block: ${outMovement.balance}`);
    console.log(`Date: ${new Date(outMovement.date).toLocaleString()}`);
    console.log('='.repeat(80));
    
    // Get product and warehouse details
    const product = await Product.findById(outMovement.productId);
    const warehouse = await Warehouse.findById(outMovement.warehouseId);
    
    console.log(`\nProduct: ${product?.itemName || 'Unknown'} (${product?.productCode || 'N/A'})`);
    console.log(`Warehouse: ${warehouse?.name || 'Unknown'}`);
    
    // Get current balance
    const latestMovement = await StockMovement.findOne({
      productId: outMovement.productId,
      warehouseId: outMovement.warehouseId
    }).sort({ date: -1, createdAt: -1 });
    
    const currentBalance = latestMovement ? latestMovement.balance : 0;
    console.log(`\nCurrent Balance: ${currentBalance}`);
    console.log(`After Restoration: ${currentBalance + outMovement.quantity}`);
    
    // Check if stock was already restored
    const existingInMovement = await StockMovement.findOne({
      referenceNo: orderNumber,
      type: 'IN'
    });
    
    if (existingInMovement) {
      console.log('\n⚠️  Stock was already restored!');
      console.log(`   IN movement found: ${existingInMovement.quantity} units on ${new Date(existingInMovement.date).toLocaleString()}`);
      return;
    }
    
    console.log('\n🔄 Creating IN movement to restore stock...');
    
    // Create IN movement to restore the stock
    const newBalance = currentBalance + outMovement.quantity;
    
    const restoreMovement = new StockMovement({
      productId: outMovement.productId,
      warehouseId: outMovement.warehouseId,
      type: 'IN',
      quantity: outMovement.quantity,
      balance: newBalance,
      referenceNo: orderNumber,
      referenceType: 'SALE',
      date: new Date(),
      remarks: `Order ${orderNumber} - Stock Restored (Manual Fix - Order was cancelled but products were missing)`,
      createdBy: null // System fix
    });
    
    await restoreMovement.save();
    
    console.log('\n✅ STOCK RESTORED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log(`Product: ${product?.itemName || 'Unknown'}`);
    console.log(`Warehouse: ${warehouse?.name || 'Unknown'}`);
    console.log(`Quantity Restored: ${outMovement.quantity}`);
    console.log(`Previous Balance: ${currentBalance}`);
    console.log(`New Balance: ${newBalance}`);
    console.log('='.repeat(80));
    
    console.log('\n💡 RECOMMENDATION:');
    console.log('   Investigate why the order products were empty when cancelled.');
    console.log('   This prevented automatic stock restoration.');
    console.log('   Check if there\'s a bug in the order update/delete logic.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

restoreStock();
