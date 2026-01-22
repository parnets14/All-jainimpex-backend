import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const testBulkOperationsFiltering = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Test 1: Get filter options
    console.log('\n🔍 Testing Filter Options...');
    
    const [brands, categories, subcategories] = await Promise.all([
      Brand.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 }),
      
      Category.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 }),
      
      Subcategory.find({ $or: [{ isActive: true }, { isActive: { $exists: false } }] })
        .select('name')
        .sort({ name: 1 })
    ]);

    console.log(`📊 Found ${brands.length} brands, ${categories.length} categories, ${subcategories.length} subcategories`);
    
    // Show first few of each
    console.log('\n📋 Sample Filter Options:');
    console.log('Brands:', brands.slice(0, 3).map(b => `${b.name} (${b._id})`));
    console.log('Categories:', categories.slice(0, 3).map(c => `${c.name} (${c._id})`));
    console.log('Subcategories:', subcategories.slice(0, 3).map(s => `${s.name} (${s._id})`));

    // Test 2: Test filtering by category (the one mentioned in the user's issue)
    console.log('\n🔍 Testing Category Filtering...');
    
    // Find "Cera cp fittings" category
    const ceraCategory = categories.find(c => c.name.toLowerCase().includes('cera'));
    if (ceraCategory) {
      console.log(`\n📦 Testing with category: ${ceraCategory.name} (${ceraCategory._id})`);
      
      const productsInCategory = await Product.find({ 
        category: ceraCategory._id 
      }).populate('brand category subcategory');
      
      console.log(`✅ Found ${productsInCategory.length} products in "${ceraCategory.name}" category`);
      
      productsInCategory.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.itemName} (${product.productCode})`);
        console.log(`     Brand: ${product.brand?.name || 'N/A'}`);
        console.log(`     Category: ${product.category?.name || 'N/A'}`);
        console.log(`     Subcategory: ${product.subcategory?.name || 'N/A'}`);
      });
    } else {
      console.log('❌ "Cera cp fittings" category not found');
      
      // Show available categories that might match
      const possibleMatches = categories.filter(c => 
        c.name.toLowerCase().includes('cera') || 
        c.name.toLowerCase().includes('fitting') ||
        c.name.toLowerCase().includes('cp')
      );
      
      console.log('🔍 Possible matching categories:');
      possibleMatches.forEach(cat => {
        console.log(`  - ${cat.name} (${cat._id})`);
      });
    }

    // Test 3: Test with any category that has products
    console.log('\n🔍 Testing with first available category...');
    
    for (const category of categories.slice(0, 5)) {
      const productCount = await Product.countDocuments({ category: category._id });
      console.log(`📦 Category "${category.name}": ${productCount} products`);
      
      if (productCount > 0) {
        const sampleProducts = await Product.find({ category: category._id })
          .populate('brand category subcategory')
          .limit(3);
        
        console.log(`   Sample products:`);
        sampleProducts.forEach(product => {
          console.log(`   - ${product.itemName} (${product.productCode})`);
        });
        break;
      }
    }

    // Test 4: Check product hierarchy structure
    console.log('\n🔍 Testing Product Hierarchy Structure...');
    
    const sampleProducts = await Product.find({})
      .populate('brand category subcategory')
      .limit(5);
    
    console.log('📦 Sample products with hierarchy:');
    sampleProducts.forEach(product => {
      console.log(`\n- ${product.itemName} (${product.productCode})`);
      console.log(`  Brand: ${product.brand?.name || 'N/A'} (ID: ${product.brand?._id || 'N/A'})`);
      console.log(`  Category: ${product.category?.name || 'N/A'} (ID: ${product.category?._id || 'N/A'})`);
      console.log(`  Subcategory: ${product.subcategory?.name || 'N/A'} (ID: ${product.subcategory?._id || 'N/A'})`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testBulkOperationsFiltering();