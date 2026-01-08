import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

const updateProductTypes = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');

    const salesTypes = ['CD Sales', 'Regular Sale'];
    const productTypes = ['Regular Product', 'AO Product'];

    // Get all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to update`);

    let updated = 0;
    for (const product of products) {
      // Randomly assign salesType and productType
      const randomSalesType = salesTypes[Math.floor(Math.random() * salesTypes.length)];
      const randomProductType = productTypes[Math.floor(Math.random() * productTypes.length)];

      // Use updateOne to bypass validation
      await Product.updateOne(
        { _id: product._id },
        { 
          $set: { 
            salesType: randomSalesType,
            productType: randomProductType
          }
        }
      );
      
      updated++;
      console.log(`Updated ${product.itemName}: ${randomSalesType}, ${randomProductType}`);
    }

    console.log(`\n✅ Successfully updated ${updated} products`);
    console.log('\nDistribution:');
    
    const cdSalesCount = await Product.countDocuments({ salesType: 'CD Sales' });
    const regularSaleCount = await Product.countDocuments({ salesType: 'Regular Sale' });
    const aoProductCount = await Product.countDocuments({ productType: 'AO Product' });
    const regularProductCount = await Product.countDocuments({ productType: 'Regular Product' });
    
    console.log(`CD Sales: ${cdSalesCount}`);
    console.log(`Regular Sale: ${regularSaleCount}`);
    console.log(`AO Product: ${aoProductCount}`);
    console.log(`Regular Product: ${regularProductCount}`);

    process.exit(0);
  } catch (error) {
    console.error('Error updating products:', error);
    process.exit(1);
  }
};

updateProductTypes();
