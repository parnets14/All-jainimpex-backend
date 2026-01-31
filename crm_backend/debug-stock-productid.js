import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Stock from './models/Stock.js';
import Product from './models/Product.js';

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
    
    // Get stock data to see what productId field contains
    const stocks = await Stock.find().populate('productId', 'itemName productCode').lean();
    
    console.log('🔍 Stock Data Structure:');
    stocks.slice(0, 5).forEach((stock, index) => {
      console.log(`\n   Stock ${index + 1}:`);
      console.log(`     - _id: ${stock._id}`);
      console.log(`     - productId: ${stock.productId}`);
      console.log(`     - productId type: ${typeof stock.productId}`);
      if (stock.productId && typeof stock.productId === 'object') {
        console.log(`     - productId._id: ${stock.productId._id}`);
        console.log(`     - productId.itemName: "${stock.productId.itemName}"`);
        console.log(`     - productId.productCode: "${stock.productId.productCode}"`);
      }
      console.log(`     - netStock: ${stock.netStock}`);
      console.log(`     - warehouseId: ${stock.warehouseId}`);
    });
    
    // Find stocks for our specific products
    console.log('\n🔍 Looking for our specific products...');
    const targetProductIds = ['6979b839be2f2eaac8767ccd', '697b2ac00f3f5d530665d2c7'];
    
    for (const productId of targetProductIds) {
      const stock = await Stock.findOne({ productId: new mongoose.Types.ObjectId(productId) })
        .populate('productId', 'itemName productCode')
        .lean();
      
      if (stock) {
        console.log(`\n   Found stock for product ${productId}:`);
        console.log(`     - Stock _id: ${stock._id}`);
        console.log(`     - productId (ObjectId): ${stock.productId._id}`);
        console.log(`     - Product Name: "${stock.productId.itemName}"`);
        console.log(`     - Product Code: "${stock.productId.productCode}"`);
        console.log(`     - Net Stock: ${stock.netStock}`);
      } else {
        console.log(`\n   ❌ No stock found for product ${productId}`);
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Debug Complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();