import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Stock from './models/Stock.js';
import Warehouse from './models/Warehouse.js';

dotenv.config();

const createStockEntriesForPendingOrders = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get all out-of-stock orders
    const outOfStockOrders = await SalesOrder.find({
      isOutOfStock: true,
      status: "Pending"
    }).lean();
    
    console.log(`🔍 Found ${outOfStockOrders.length} out-of-stock orders`);
    
    // Get a default warehouse (first available warehouse)
    const defaultWarehouse = await Warehouse.findOne().lean();
    if (!defaultWarehouse) {
      console.log('❌ No warehouses found - cannot create stock entries');
      return;
    }
    
    console.log(`📦 Using default warehouse: ${defaultWarehouse.name} (${defaultWarehouse._id})`);
    
    const createdEntries = [];
    
    for (const order of outOfStockOrders) {
      console.log(`\n🔍 Processing order: ${order.orderNumber}`);
      
      for (const product of order.products) {
        console.log(`   📦 Product: ${product.productName} (${product.product})`);
        
        // Check if stock entry already exists for this product in any warehouse
        const existingStock = await Stock.findOne({ productId: product.product });
        
        if (existingStock) {
          console.log(`   ✅ Stock entry already exists - skipping`);
          continue;
        }
        
        // Get product details
        const productDoc = await Product.findById(product.product);
        if (!productDoc) {
          console.log(`   ❌ Product not found - skipping`);
          continue;
        }
        
        // Create zero-stock entry
        const stockEntry = new Stock({
          productId: product.product,
          productCode: productDoc.productCode,
          itemName: productDoc.itemName,
          description: productDoc.description,
          HSNCode: productDoc.HSNCode,
          warehouseId: defaultWarehouse._id,
          warehouse: defaultWarehouse.name,
          supplier: productDoc.supplier || 'Unknown',
          basePrice: productDoc.rateSlabs?.[0]?.rate || 0,
          gst: productDoc.gst || 0,
          totalPrice: (productDoc.rateSlabs?.[0]?.rate || 0) * (1 + (productDoc.gst || 0) / 100),
          totalQty: 0,
          damagedQty: 0,
          blockedQty: 0,
          netStock: 0,
          minStockLevel: 0
        });
        
        await stockEntry.save();
        createdEntries.push({
          product: productDoc.itemName,
          productCode: productDoc.productCode,
          warehouse: defaultWarehouse.name
        });
        
        console.log(`   ✅ Created zero-stock entry for ${productDoc.itemName} in ${defaultWarehouse.name}`);
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   - Created ${createdEntries.length} stock entries`);
    createdEntries.forEach(entry => {
      console.log(`     * ${entry.product} (${entry.productCode}) in ${entry.warehouse}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

createStockEntriesForPendingOrders();