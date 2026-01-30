import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import GRN from './models/GRN.js';

async function testStockAPIWithBrandFilter() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n=== TESTING STOCK API WITH BRAND FILTER ===\n');

    // Get brand 2 ID
    const brand2 = await Brand.findOne({ name: 'brand 2' });
    if (!brand2) {
      console.log('❌ Brand 2 not found!');
      return;
    }

    console.log(`1. Testing with Brand 2 ID: ${brand2._id}`);

    // Simulate the stock API logic with brand filter
    const brandId = brand2._id.toString();
    const page = 1;
    const limit = 10;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build product query with brand filter (this is the fixed logic)
    const productQuery = {
      brand: brandId
    };

    console.log(`2. Product query:`, productQuery);

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(productQuery);
    console.log(`3. Total products matching filter: ${totalProducts}`);

    // Get paginated products
    const products = await Product.find(productQuery)
      .skip(skip)
      .limit(limitNum)
      .lean();

    console.log(`4. Products found (page ${pageNum}):`, products.length);
    products.forEach(product => {
      console.log(`   - ${product.itemName} (${product.productCode}) - Brand: ${product.brand}`);
    });

    // Now test without brand filter to compare
    console.log('\n5. COMPARISON - WITHOUT BRAND FILTER:');
    const allProducts = await Product.find({}).lean();
    console.log(`   - All products: ${allProducts.length}`);
    allProducts.forEach(product => {
      console.log(`   - ${product.itemName} (${product.productCode}) - Brand: ${product.brand}`);
    });

    // Check if there are GRNs for the filtered products
    console.log('\n6. CHECKING GRNs FOR FILTERED PRODUCTS:');
    for (const product of products) {
      const grns = await GRN.find({ 'items.productId': product._id });
      console.log(`   - Product ${product.productCode}: ${grns.length} GRNs found`);
    }

    console.log('\n7. SUMMARY:');
    console.log(`   - Brand filter applied: ${brandId}`);
    console.log(`   - Products before filter: ${allProducts.length}`);
    console.log(`   - Products after filter: ${products.length}`);
    console.log(`   - Filter working: ${products.length < allProducts.length ? '✅ YES' : '❌ NO'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

testStockAPIWithBrandFilter();