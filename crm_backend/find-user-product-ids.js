import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const findUserProductIds = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Find products by name
    const productNames = ['Wire Links', 'product2', 'wire belts', 'h cpvc brass elbow 3/4x1/2"'];
    
    console.log('🔍 Searching for user products...\n');
    
    for (const name of productNames) {
      const products = await Product.find({ 
        itemName: { $regex: name, $options: 'i' } 
      }).select('_id itemName itemCode');
      
      console.log(`📦 Products matching "${name}":`);
      if (products.length === 0) {
        console.log('  ❌ No products found');
      } else {
        products.forEach(product => {
          console.log(`  ✅ ${product.itemName} (${product.itemCode}) - ID: ${product._id}`);
        });
      }
      console.log('');
    }

    // Also search for all products to see what's available
    console.log('📊 All products in database:');
    const allProducts = await Product.find({}).select('_id itemName itemCode').limit(20);
    allProducts.forEach(product => {
      console.log(`  - ${product.itemName} (${product.itemCode}) - ID: ${product._id}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the script
findUserProductIds();