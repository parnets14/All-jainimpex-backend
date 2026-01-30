import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Brand from './models/Brand.js';

dotenv.config();

const testProductFilterFix = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get products the same way the API does (with population)
    const products = await Product.find({})
      .populate("category", "name")
      .populate("subcategory", "name")
      .populate("brand", "name")
      .limit(5);

    console.log(`\n📦 Found ${products.length} products for testing`);

    // Get all unique categories, subcategories, and brands from the products
    const categories = [...new Set(products.map(p => p.category?._id?.toString()).filter(Boolean))];
    const subcategories = [...new Set(products.map(p => p.subcategory?._id?.toString()).filter(Boolean))];
    const brands = [...new Set(products.map(p => p.brand?._id?.toString()).filter(Boolean))];

    console.log('\n🏷️ Available filters:');
    console.log('Categories:', categories);
    console.log('Subcategories:', subcategories);
    console.log('Brands:', brands);

    // Test category filtering (the main issue)
    console.log('\n🧪 TESTING CATEGORY FILTER:');
    for (const categoryId of categories) {
      const categoryName = products.find(p => p.category?._id?.toString() === categoryId)?.category?.name;
      
      // OLD (broken) logic
      const oldLogicResult = products.filter(product => 
        product.category && product.category.toString() === categoryId
      );
      
      // NEW (fixed) logic
      const newLogicResult = products.filter(product => 
        product.category && product.category._id && product.category._id.toString() === categoryId
      );
      
      console.log(`\n  Category: ${categoryName} (${categoryId})`);
      console.log(`  ❌ Old logic: ${oldLogicResult.length} products`);
      console.log(`  ✅ New logic: ${newLogicResult.length} products`);
      console.log(`  Products: ${newLogicResult.map(p => p.itemName).join(', ')}`);
    }

    // Test subcategory filtering
    console.log('\n🧪 TESTING SUBCATEGORY FILTER:');
    for (const subcategoryId of subcategories.slice(0, 2)) { // Test first 2
      const subcategoryName = products.find(p => p.subcategory?._id?.toString() === subcategoryId)?.subcategory?.name;
      
      const result = products.filter(product => 
        product.subcategory && product.subcategory._id && product.subcategory._id.toString() === subcategoryId
      );
      
      console.log(`\n  Subcategory: ${subcategoryName} (${subcategoryId})`);
      console.log(`  ✅ Results: ${result.length} products`);
      console.log(`  Products: ${result.map(p => p.itemName).join(', ')}`);
    }

    // Test brand filtering
    console.log('\n🧪 TESTING BRAND FILTER:');
    for (const brandId of brands.slice(0, 2)) { // Test first 2
      const brandName = products.find(p => p.brand?._id?.toString() === brandId)?.brand?.name;
      
      const result = products.filter(product => 
        product.brand && product.brand._id && product.brand._id.toString() === brandId
      );
      
      console.log(`\n  Brand: ${brandName} (${brandId})`);
      console.log(`  ✅ Results: ${result.length} products`);
      console.log(`  Products: ${result.map(p => p.itemName).join(', ')}`);
    }

    // Test combined filtering
    if (categories.length > 0 && brands.length > 0) {
      console.log('\n🧪 TESTING COMBINED FILTERS:');
      const testCategoryId = categories[0];
      const testBrandId = brands[0];
      
      const combinedResult = products.filter(product => 
        product.category && product.category._id && product.category._id.toString() === testCategoryId &&
        product.brand && product.brand._id && product.brand._id.toString() === testBrandId
      );
      
      console.log(`\n  Category + Brand filter:`);
      console.log(`  ✅ Results: ${combinedResult.length} products`);
      console.log(`  Products: ${combinedResult.map(p => p.itemName).join(', ')}`);
    }

    console.log('\n✅ All filter tests completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

testProductFilterFix();