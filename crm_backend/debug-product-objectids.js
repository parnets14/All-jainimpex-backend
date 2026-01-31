import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SalesOrder from './models/SalesOrder.js';
import Product from './models/Product.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get the specific order SO-2026-0003
    const order = await SalesOrder.findOne({ orderNumber: 'SO-2026-0003' }).lean();
    
    if (!order) {
      console.log('❌ Order SO-2026-0003 not found');
      return;
    }
    
    console.log('🔍 Order SO-2026-0003 Product Details:');
    
    for (let i = 0; i < order.products.length; i++) {
      const product = order.products[i];
      console.log(`\n   Product ${i + 1}:`);
      console.log(`     - product (ObjectId): ${product.product}`);
      console.log(`     - productId: ${product.productId}`);
      console.log(`     - productName: "${product.productName}"`);
      console.log(`     - quantity: ${product.quantity}`);
      
      // Get the actual product details
      if (product.product) {
        const productDetails = await Product.findById(product.product).lean();
        if (productDetails) {
          console.log(`     - Actual Product Details:`);
          console.log(`       * itemName: "${productDetails.itemName}"`);
          console.log(`       * productCode: "${productDetails.productCode}"`);
          console.log(`       * _id: ${productDetails._id}`);
        }
      }
    }
    
    // Test the corrected aggregation query using 'product' field
    console.log('\n🧪 Testing Corrected Sales Analytics Query...');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    
    console.log(`   Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Get all product ObjectIds from the order
    const productObjectIds = order.products.map(p => p.product).filter(Boolean);
    console.log(`   Product ObjectIds: ${JSON.stringify(productObjectIds)}`);
    
    // Test aggregation with actual ObjectIds
    for (const productObjectId of productObjectIds) {
      console.log(`\n   Testing for product ObjectId "${productObjectId}":`)
      const result = await SalesOrder.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        { $unwind: '$products' },
        {
          $match: {
            'products.product': new mongoose.Types.ObjectId(productObjectId)
          }
        },
        {
          $group: {
            _id: '$products.product',
            totalQuantity: { $sum: '$products.quantity' }
          }
        }
      ]);
      
      console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Debug Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();