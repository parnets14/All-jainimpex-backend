import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';

dotenv.config();

async function fixProductUnits() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB\n');

    // Find products with numeric or invalid units
    const products = await Product.find({});
    
    console.log(`📦 Found ${products.length} products\n`);
    
    let fixed = 0;
    
    for (const product of products) {
      let needsUpdate = false;
      let newUnit = product.unit;
      
      // Check if unit is a number or looks like a number
      if (!product.unit || product.unit === '' || !isNaN(product.unit)) {
        newUnit = 'pcs'; // Default to pieces
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        console.log(`Fixing: ${product.productCode} - ${product.itemName}`);
        console.log(`  Old unit: "${product.unit}" → New unit: "${newUnit}"`);
        
        await Product.updateOne(
          { _id: product._id },
          { $set: { unit: newUnit } }
        );
        
        fixed++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} products`);
    console.log(`✓ ${products.length - fixed} products already had valid units`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

fixProductUnits();
