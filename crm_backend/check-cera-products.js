import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const checkCeraProducts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Checking products under Cera brand...\n');

    // Find products under Cera brand
    const ceraProducts = await Product.find({ brand: '6968f3465eb9746eb301e6e2' });
    
    console.log(`Found ${ceraProducts.length} products under Cera brand:`);
    
    ceraProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.itemName || product.productName || 'Unnamed Product'}`);
      console.log(`      Product ID: ${product._id}`);
      console.log(`      Product Code: ${product.productCode || 'No Code'}`);
      console.log(`      Brand ID: ${product.brand}`);
    });

    if (ceraProducts.length === 0) {
      console.log('\n❌ NO PRODUCTS FOUND under Cera brand!');
      console.log('   This is why the purchase discount is not showing.');
      console.log('   SOLUTIONS:');
      console.log('   1. Create a purchase discount for "All Brands" (no brand specified)');
      console.log('   2. Or assign some products to the Cera brand');
      console.log('   3. Or create a purchase discount for the brand that your products actually belong to');
      
      // Check what brands actually exist
      console.log('\n📝 Checking what products and brands exist...');
      const allProducts = await Product.find().limit(10);
      console.log(`\nSample of ${allProducts.length} products in database:`);
      
      allProducts.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.itemName || product.productName || 'Unnamed Product'}`);
        console.log(`      Brand ID: ${product.brand || 'No Brand'}`);
      });
    } else {
      console.log('\n✅ Products found under Cera brand!');
      console.log('   The purchase discount should work for these products.');
      console.log('   If not showing in Purchase Order Management, check:');
      console.log('   1. Are you selecting these specific products?');
      console.log('   2. Check browser console for errors');
      console.log('   3. Verify the frontend is calling the correct API');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the check
checkCeraProducts();