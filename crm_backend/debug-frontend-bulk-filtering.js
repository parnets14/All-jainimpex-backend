import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Category from './models/Category.js';

dotenv.config();

const debugFrontendBulkFiltering = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Get the "Cera cp fittings" category
    const ceraCategory = await Category.findOne({ 
      name: { $regex: /cera.*cp.*fitting/i } 
    });
    
    if (!ceraCategory) {
      console.log('❌ Cera cp fittings category not found');
      return;
    }

    console.log(`\n📦 Found category: ${ceraCategory.name}`);
    console.log(`📋 Category ID: ${ceraCategory._id}`);
    console.log(`📋 Category ID toString: ${ceraCategory._id.toString()}`);

    // Get products in this category with full population
    const products = await Product.find({ category: ceraCategory._id })
      .populate('brand', 'name')
      .populate('category', 'name') 
      .populate('subcategory', 'name');

    console.log(`\n✅ Found ${products.length} products in category`);

    products.forEach((product, index) => {
      console.log(`\n${index + 1}. Product: ${product.itemName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand?.name || 'N/A'} (ID: ${product.brand?._id || 'N/A'})`);
      console.log(`   Category: ${product.category?.name || 'N/A'} (ID: ${product.category?._id || 'N/A'})`);
      console.log(`   Subcategory: ${product.subcategory?.name || 'N/A'} (ID: ${product.subcategory?._id || 'N/A'})`);
      
      // Test the frontend filtering logic
      console.log('\n   🔍 Frontend Filtering Tests:');
      
      const categoryId = ceraCategory._id.toString();
      
      // Test all the conditions from frontend
      const test1 = product.category?._id === categoryId;
      const test2 = product.category === categoryId;
      const test3 = product.category?._id?.toString() === categoryId;
      const test4 = product.category?.toString() === categoryId;
      
      console.log(`   - product.category?._id === categoryId: ${test1}`);
      console.log(`   - product.category === categoryId: ${test2}`);
      console.log(`   - product.category?._id?.toString() === categoryId: ${test3}`);
      console.log(`   - product.category?.toString() === categoryId: ${test4}`);
      
      console.log(`   📊 Raw category value: ${JSON.stringify(product.category)}`);
      console.log(`   📊 Raw category._id: ${product.category?._id}`);
      console.log(`   📊 Raw category._id type: ${typeof product.category?._id}`);
      console.log(`   📊 Target categoryId: ${categoryId}`);
      console.log(`   📊 Target categoryId type: ${typeof categoryId}`);
      
      const matches = test1 || test2 || test3 || test4;
      console.log(`   ✅ Overall match result: ${matches}`);
    });

    // Also test with ObjectId comparison
    console.log('\n🔍 Testing ObjectId comparison:');
    const ObjectId = mongoose.Types.ObjectId;
    const categoryObjectId = new ObjectId(ceraCategory._id);
    
    products.forEach((product, index) => {
      const productCategoryId = product.category?._id;
      const objectIdMatch = productCategoryId && productCategoryId.equals(categoryObjectId);
      console.log(`${index + 1}. ObjectId.equals() match: ${objectIdMatch}`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

debugFrontendBulkFiltering();