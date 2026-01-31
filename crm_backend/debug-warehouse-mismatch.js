import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';

dotenv.config();

async function debugWarehouseMismatch() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    const productId = '6979b839be2f2eaac8767ccd';
    const frontendWarehouseId = '68e8f0283f5fd5a817866df6';

    console.log('\n🔍 Checking sales orders for product:', productId);
    console.log('🔍 Frontend is filtering by warehouseId:', frontendWarehouseId);

    // Find all sales orders with this product
    const salesOrders = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId)
    });

    console.log('\n📊 Sales Orders Found:');
    salesOrders.forEach(order => {
      console.log(`\n🔍 Order: ${order.orderNumber}`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - Created: ${order.createdAt}`);
      console.log(`   - Top-level warehouseId: ${order.warehouseId || 'undefined'}`);
      
      const relevantProducts = order.products.filter(p => p.product.toString() === productId);
      relevantProducts.forEach(product => {
        console.log(`   - Product warehouse ID: ${product.warehouse || 'undefined'}`);
        console.log(`   - Quantity: ${product.quantity}`);
      });
    });

    // Check if any orders have the specific warehouseId at top level
    const ordersWithWarehouseId = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      warehouseId: frontendWarehouseId
    });

    console.log(`\n🔍 Orders with top-level warehouseId ${frontendWarehouseId}: ${ordersWithWarehouseId.length}`);

    // Check if any products have the specific warehouse ID
    const ordersWithProductWarehouse = await SalesOrder.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      'products.warehouse': new mongoose.Types.ObjectId(frontendWarehouseId)
    });

    console.log(`🔍 Orders with product-level warehouse ${frontendWarehouseId}: ${ordersWithProductWarehouse.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugWarehouseMismatch();