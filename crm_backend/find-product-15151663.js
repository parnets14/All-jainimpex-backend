// Find the actual ObjectId for product 15151663
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const MONGO_URL = process.env.MONGO_URL;

async function findProduct() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find product by productCode
    const product = await Product.findOne({ productCode: '15151663' });

    if (product) {
      console.log('✅ Product Found:');
      console.log('==================');
      console.log(`Product Code: ${product.productCode}`);
      console.log(`Product Name: ${product.itemName}`);
      console.log(`HSN Code: ${product.HSNCode}`);
      console.log(`ObjectId: ${product._id}`);
      console.log(`\nUse this ObjectId in queries: "${product._id}"`);
    } else {
      console.log('❌ Product not found with productCode: 15151663');
      
      // Try searching by HSN
      console.log('\nSearching by HSN Code 51550965...');
      const productByHSN = await Product.findOne({ HSNCode: '51550965' });
      
      if (productByHSN) {
        console.log('✅ Product Found by HSN:');
        console.log('========================');
        console.log(`Product Code: ${productByHSN.productCode}`);
        console.log(`Product Name: ${productByHSN.itemName}`);
        console.log(`HSN Code: ${productByHSN.HSNCode}`);
        console.log(`ObjectId: ${productByHSN._id}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

findProduct();
