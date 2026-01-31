import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';

dotenv.config();

const fixOutOfStockOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Find the order that should be out-of-stock (has "No Stock" warehouse)
    const orderToFix = await SalesOrder.findOne({
      orderNumber: "SO-2026-0002"
    });
    
    if (!orderToFix) {
      console.log('❌ Order SO-2026-0002 not found');
      return;
    }
    
    console.log(`🔍 Found order: ${orderToFix.orderNumber}`);
    console.log(`   - Current isOutOfStock: ${orderToFix.isOutOfStock}`);
    console.log(`   - Current status: ${orderToFix.status}`);
    
    // Check if this order has "No Stock" warehouse
    const hasNoStockWarehouse = orderToFix.products.some(product => 
      product.warehouseName === "No Stock" || product.warehouse === null
    );
    
    if (hasNoStockWarehouse) {
      console.log('🚨 Order has "No Stock" warehouse - fixing to be out-of-stock order');
      
      // Update the order to be properly marked as out-of-stock
      orderToFix.isOutOfStock = true;
      orderToFix.status = "Pending"; // Ensure status is Pending
      
      // Create stock validation entries
      orderToFix.stockValidation = [];
      for (const product of orderToFix.products) {
        orderToFix.stockValidation.push({
          productId: product.product,
          productName: product.productName,
          availableStock: 0,
          requestedQuantity: product.quantity,
          hasStock: false,
          shortfall: product.quantity,
          warehouseId: null, // No warehouse assigned
          warehouseName: "No Stock"
        });
      }
      
      await orderToFix.save();
      console.log('✅ Order fixed successfully!');
      console.log(`   - New isOutOfStock: ${orderToFix.isOutOfStock}`);
      console.log(`   - New status: ${orderToFix.status}`);
      console.log(`   - Stock validation entries: ${orderToFix.stockValidation.length}`);
    } else {
      console.log('ℹ️ Order does not appear to be out-of-stock');
    }
    
    await mongoose.disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

fixOutOfStockOrder();