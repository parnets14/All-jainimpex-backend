import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const debugProductFilterFields = async () => {
  try {
    console.log('🔍 Debugging product filter fields...\n');

    // Get a sample of products to see their structure
    const sampleProducts = await Product.find().limit(5);
    
    console.log(`📦 Found ${sampleProducts.length} sample products:`);
    
    sampleProducts.forEach((product, index) => {
      console.log(`\n${index + 1}. Product: ${product.itemName}`);
      console.log(`   _id: ${product._id}`);
      console.log(`   productCode: ${product.productCode}`);
      console.log(`   brand: ${product.brand} (type: ${typeof product.brand})`);
      console.log(`   brandId: ${product.brandId} (type: ${typeof product.brandId})`);
      console.log(`   brandName: ${product.brandName}`);
      console.log(`   category: ${product.category} (type: ${typeof product.category})`);
      console.log(`   categoryId: ${product.categoryId} (type: ${typeof product.categoryId})`);
      console.log(`   categoryName: ${product.categoryName}`);
      console.log(`   subcategory: ${product.subcategory} (type: ${typeof product.subcategory})`);
      console.log(`   subcategoryId: ${product.subcategoryId} (type: ${typeof product.subcategoryId})`);
      console.log(`   subcategoryName: ${product.subcategoryName}`);
    });

    // Check what fields are actually used for filtering
    console.log('\n🔍 Analyzing field usage for filtering:');
    
    const brandFieldAnalysis = await Product.aggregate([
      {
        $group: {
          _id: null,
          hasBrand: { $sum: { $cond: [{ $ne: ["$brand", null] }, 1, 0] } },
          hasBrandId: { $sum: { $cond: [{ $ne: ["$brandId", null] }, 1, 0] } },
          hasBrandName: { $sum: { $cond: [{ $ne: ["$brandName", null] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);
    
    const categoryFieldAnalysis = await Product.aggregate([
      {
        $group: {
          _id: null,
          hasCategory: { $sum: { $cond: [{ $ne: ["$category", null] }, 1, 0] } },
          hasCategoryId: { $sum: { $cond: [{ $ne: ["$categoryId", null] }, 1, 0] } },
          hasCategoryName: { $sum: { $cond: [{ $ne: ["$categoryName", null] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);
    
    const subcategoryFieldAnalysis = await Product.aggregate([
      {
        $group: {
          _id: null,
          hasSubcategory: { $sum: { $cond: [{ $ne: ["$subcategory", null] }, 1, 0] } },
          hasSubcategoryId: { $sum: { $cond: [{ $ne: ["$subcategoryId", null] }, 1, 0] } },
          hasSubcategoryName: { $sum: { $cond: [{ $ne: ["$subcategoryName", null] }, 1, 0] } },
          total: { $sum: 1 }
        }
      }
    ]);

    console.log('\n📊 Brand field analysis:', brandFieldAnalysis[0]);
    console.log('📊 Category field analysis:', categoryFieldAnalysis[0]);
    console.log('📊 Subcategory field analysis:', subcategoryFieldAnalysis[0]);

    // Test filtering with different field combinations
    console.log('\n🧪 Testing filter combinations...');
    
    // Get first brand, category, subcategory IDs for testing
    const firstProduct = sampleProducts[0];
    if (firstProduct) {
      console.log(`\n🔬 Testing filters with product: ${firstProduct.itemName}`);
      
      // Test brand filtering
      if (firstProduct.brand) {
        const brandFilterTest1 = await Product.countDocuments({ brand: firstProduct.brand });
        console.log(`   Brand filter (brand field): ${brandFilterTest1} products`);
      }
      
      if (firstProduct.brandId) {
        const brandFilterTest2 = await Product.countDocuments({ brandId: firstProduct.brandId });
        console.log(`   Brand filter (brandId field): ${brandFilterTest2} products`);
      }
      
      // Test category filtering
      if (firstProduct.category) {
        const categoryFilterTest1 = await Product.countDocuments({ category: firstProduct.category });
        console.log(`   Category filter (category field): ${categoryFilterTest1} products`);
      }
      
      if (firstProduct.categoryId) {
        const categoryFilterTest2 = await Product.countDocuments({ categoryId: firstProduct.categoryId });
        console.log(`   Category filter (categoryId field): ${categoryFilterTest2} products`);
      }
      
      // Test subcategory filtering
      if (firstProduct.subcategory) {
        const subcategoryFilterTest1 = await Product.countDocuments({ subcategory: firstProduct.subcategory });
        console.log(`   Subcategory filter (subcategory field): ${subcategoryFilterTest1} products`);
      }
      
      if (firstProduct.subcategoryId) {
        const subcategoryFilterTest2 = await Product.countDocuments({ subcategoryId: firstProduct.subcategoryId });
        console.log(`   Subcategory filter (subcategoryId field): ${subcategoryFilterTest2} products`);
      }
    }

    console.log('\n✅ Product filter field analysis completed!');

  } catch (error) {
    console.error('❌ Error debugging product filter fields:', error);
  }
};

const main = async () => {
  await connectDB();
  await debugProductFilterFields();
  await mongoose.disconnect();
  console.log('🔌 Database connection closed');
};

main().catch(console.error);