import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Product from './models/Product.js';
import Stock from './models/Stock.js';
import Brand from './models/Brand.js';

async function debugStockFiltering() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== DEBUGGING STOCK FILTERING ISSUE ===\n');

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

    // 3. Check stock data and product relationships
    console.log('\n3. CHECKING STOCK DATA:');
    const stockItems = await Stock.find({}).populate('productId');
    stockItems.forEach(stock => {
      console.log(`   - Stock Product: ${stock.productId?.itemName || 'NO PRODUCT'}`);
      console.log(`     Product Code: ${stock.productId?.productCode || 'NO CODE'}`);
      console.log(`     Product Brand ID: ${stock.productId?.brand || 'NO BRAND ID'}`);
      console.log(`     Stock ID: ${stock._id}`);
    });

    // 4. Test filtering with brand 2
    console.log('\n4. TESTING BRAND FILTERING:');
    const brand2 = brands.find(b => b.name === 'brand 2');
    if (brand2) {
      console.log(`   Testing filter with Brand 2 ID: ${brand2._id}`);
      
      // Find products with brand 2
      const brand2Products = await Product.find({ brand: brand2._id });
      console.log(`   Products with brand 2: ${brand2Products.length}`);
      brand2Products.forEach(product => {
        console.log(`     - ${product.itemName} (${product.productCode})`);
      });

      // Find stock for brand 2 products
      const brand2ProductIds = brand2Products.map(p => p._id);
      const brand2Stock = await Stock.find({ productId: { $in: brand2ProductIds } });
      console.log(`   Stock items for brand 2 products: ${brand2Stock.length}`);
      
      // Test the actual stock API query simulation
      console.log('\n5. SIMULATING STOCK API QUERY WITH BRAND FILTER:');
      
      // This is what the stock API should be doing
      const pipeline = [
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        {
          $unwind: '$product'
        },
        {
          $match: {
            'product.brand': brand2._id
          }
        }
      ];

      const filteredStock = await Stock.aggregate(pipeline);
      console.log(`   Filtered stock results: ${filteredStock.length}`);
      filteredStock.forEach(stock => {
        console.log(`     - Product: ${stock.product.itemName} (${stock.product.productCode})`);
      });

    } else {
      console.log('   ❌ Brand 2 not found!');
    }

    // 6. Check what the current stock API might be returning
    console.log('\n6. CHECKING CURRENT STOCK API BEHAVIOR:');
    console.log('   If the API is not filtering properly, it might be:');
    console.log('   - Ignoring the brandId parameter');
    console.log('   - Not properly joining with products table');
    console.log('   - Not applying the brand filter in the query');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

debugStockFiltering();