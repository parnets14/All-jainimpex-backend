import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Product from './models/Product.js';
import Stock from './models/Stock.js';
import Brand from './models/Brand.js';

async function testStockFilteringFix() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== TESTING STOCK FILTERING FIX ===\n');

    // 1. Check all brands
    console.log('1. CHECKING ALL BRANDS:');
    const brands = await Brand.find({});
    brands.forEach(brand => {
      console.log(`   - Brand: ${brand.name} (ID: ${brand._id})`);
    });

    // 2. Check all products and their brands
    console.log('\n2. CHECKING ALL PRODUCTS AND THEIR BRANDS:');
    const products = await Product.find({}).populate('brand');
    products.forEach(product => {
      console.log(`   - Product: ${product.itemName} (Code: ${product.productCode})`);
      console.log(`     Brand: ${product.brand?.name || 'NO BRAND'} (ID: ${product.brand?._id || 'NO ID'})`);
      console.log(`     Product ID: ${product._id}`);
    });

    // 3. Test filtering with brand 2
    console.log('\n3. TESTING BRAND FILTERING:');
    const brand2 = brands.find(b => b.name === 'brand 2');
    if (brand2) {
      console.log(`   Testing filter with Brand 2 ID: ${brand2._id}`);
      
      // Test the new product query with brand filter
      const productQuery = { brand: brand2._id };
      console.log(`   Product query:`, productQuery);
      
      const filteredProducts = await Product.find(productQuery);
      console.log(`   Products matching brand filter: ${filteredProducts.length}`);
      filteredProducts.forEach(product => {
        console.log(`     - ${product.itemName} (${product.productCode})`);
      });

      // Test with no brand filter
      console.log('\n4. TESTING WITHOUT BRAND FILTER:');
      const allProducts = await Product.find({});
      console.log(`   All products: ${allProducts.length}`);
      
      console.log('\n5. COMPARISON:');
      console.log(`   - All products: ${allProducts.length}`);
      console.log(`   - Brand 2 products: ${filteredProducts.length}`);
      console.log(`   - Other brand products: ${allProducts.length - filteredProducts.length}`);
      
      if (filteredProducts.length < allProducts.length) {
        console.log('   ✅ Brand filtering is working correctly!');
      } else {
        console.log('   ❌ Brand filtering may not be working properly');
      }

    } else {
      console.log('   ❌ Brand 2 not found!');
    }

    // 6. Test the complete product query structure
    console.log('\n6. TESTING COMPLETE PRODUCT QUERY STRUCTURE:');
    const sampleProduct = products[0];
    if (sampleProduct) {
      console.log(`   Sample product structure:`, {
        _id: sampleProduct._id,
        productCode: sampleProduct.productCode,
        itemName: sampleProduct.itemName,
        brand: sampleProduct.brand?._id,
        category: sampleProduct.category,
        subcategory: sampleProduct.subcategory,
        extendedSubcategory: sampleProduct.extendedSubcategory,
        level2: sampleProduct.level2
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testStockFilteringFix();