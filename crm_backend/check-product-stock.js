import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';
import Stock from './models/Stock.js';

dotenv.config();

const checkProductStock = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get the out-of-stock order
    const outOfStockOrder = await SalesOrder.findOne({
      isOutOfStock: true,
      status: "Pending"
    }).lean();
    
    if (!outOfStockOrder) {
      console.log('❌ No out-of-stock orders found');
      return;
    }
    
    console.log(`🔍 Out-of-stock order: ${outOfStockOrder.orderNumber}`);
    
    for (const product of outOfStockOrder.products) {
      console.log(`\n📦 Product: ${product.productName} (${product.product})`);
      console.log(`   - Quantity needed: ${product.quantity}`);
      console.log(`   - Warehouse: ${product.warehouseName || 'null'}`);
      
      // Check if this product exists in the Product collection
      const productDoc = await Product.findById(product.product);
      if (productDoc) {
        console.log(`   ✅ Product exists: ${productDoc.itemName} (${productDoc.productCode})`);
      } else {
        console.log(`   ❌ Product not found in database`);
        continue;
      }
      
      // Check if there are any stock entries for this product
      const stockEntries = await Stock.find({ productId: product.product }).lean();
      console.log(`   📊 Stock entries found: ${stockEntries.length}`);
      
      if (stockEntries.length > 0) {
        stockEntries.forEach(stock => {
          console.log(`     - Warehouse: ${stock.warehouseId}, Net Stock: ${stock.netStock || 0}`);
        });
      } else {
        console.log(`   ⚠️ No stock entries found for this product`);
        console.log(`   💡 This means the product won't appear in the stock table`);
        console.log(`   💡 Pending quantities only show for products that have stock entries`);
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

checkProductStock();