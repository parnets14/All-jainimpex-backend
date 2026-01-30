import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

const debugProductStructure = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get products the same way the API does
    const products = await Product.find({})
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .limit(2);

    console.log('\n🔍 PRODUCT STRUCTURE ANALYSIS:');
    console.log(`Found ${products.length} products`);

    products.forEach((product, index) => {
      console.log(`\n--- Product ${index + 1}: ${product.itemName} ---`);
      console.log('Raw category field:', product.category);
      console.log('Category type:', typeof product.category);
      console.log('Category toString():', product.category?.toString());
      console.log('Category._id:', product.category?._id);
      console.log('Category._id toString():', product.category?._id?.toString());
      
      console.log('\nRaw subcategory field:', product.subcategory);
      console.log('Subcategory type:', typeof product.subcategory);
      console.log('Subcategory toString():', product.subcategory?.toString());
      console.log('Subcategory._id:', product.subcategory?._id);
      console.log('Subcategory._id toString():', product.subcategory?._id?.toString());
      
      console.log('\nRaw brand field:', product.brand);
      console.log('Brand type:', typeof product.brand);
      console.log('Brand toString():', product.brand?.toString());
      console.log('Brand._id:', product.brand?._id);
      console.log('Brand._id toString():', product.brand?._id?.toString());
    });

    // Test the current filter logic vs correct logic
    const testCategoryId = products[0]?.category?._id?.toString();
    if (testCategoryId) {
      console.log(`\n🧪 FILTER LOGIC TEST with category ID: ${testCategoryId}`);
      
      // Current (broken) logic
      const currentLogicResult = products.filter(product => 
        product.category && product.category.toString() === testCategoryId
      );
      console.log('❌ Current logic result:', currentLogicResult.length, 'products');
      
      // Correct logic
      const correctLogicResult = products.filter(product => 
        product.category && product.category._id.toString() === testCategoryId
      );
      console.log('✅ Correct logic result:', correctLogicResult.length, 'products');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

debugProductStructure();