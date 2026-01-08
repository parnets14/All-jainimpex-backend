import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Brand from './models/Brand.js';
import Product from './models/Product.js';

dotenv.config();

const testCompleteHierarchy = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Complete Hierarchy Flow');
    console.log('=====================================');

    // 1. Check existing hierarchy structure
    console.log('\n📋 Step 1: Current Hierarchy Structure');
    
    const categories = await Category.find({}).select('name');
    console.log(`Categories: ${categories.length}`);
    categories.forEach(cat => console.log(`  - ${cat.name} (${cat._id})`));

    const subcategories = await Subcategory.find({}).populate('category', 'name').select('name category');
    console.log(`\nSubcategories: ${subcategories.length}`);
    subcategories.forEach(sub => console.log(`  - ${sub.name} → ${sub.category?.name} (${sub._id})`));

    const extendedSubcategories = await ExtendedSubcategory.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('parentExtendedSubcategory', 'name')
      .select('name level category subcategory parentExtendedSubcategory');
    console.log(`\nExtended Subcategories: ${extendedSubcategories.length}`);
    extendedSubcategories.forEach(ext => {
      const hierarchy = [
        ext.category?.name,
        ext.subcategory?.name,
        ext.parentExtendedSubcategory?.name,
        ext.name
      ].filter(Boolean).join(' → ');
      console.log(`  - Level ${ext.level}: ${hierarchy} (${ext._id})`);
    });

    const brands = await Brand.find({})
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .populate('subcategory1', 'name')
      .populate('subcategory2', 'name')
      .populate('subcategory3', 'name')
      .populate('subcategory4', 'name')
      .populate('subcategory5', 'name')
      .select('name category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5');
    console.log(`\nBrands: ${brands.length}`);
    brands.forEach(brand => {
      const hierarchy = [
        brand.category?.name,
        brand.subcategory?.name,
        brand.subcategory1?.name,
        brand.subcategory2?.name,
        brand.subcategory3?.name,
        brand.subcategory4?.name,
        brand.subcategory5?.name
      ].filter(Boolean).join(' → ');
      console.log(`  - ${brand.name}: ${hierarchy} (${brand._id})`);
    });

    // 2. Test ProductMaster scenario - user selects category, subcategory, then extended
    console.log('\n📋 Step 2: Simulating ProductMaster User Flow');
    
    // Find a category with subcategories and extended subcategories
    const testCategory = categories.find(cat => cat.name === 'pipe');
    if (!testCategory) {
      console.log('❌ No "pipe" category found for testing');
      return;
    }

    const testSubcategory = subcategories.find(sub => 
      sub.category._id.toString() === testCategory._id.toString() && sub.name === 'pvc pipe'
    );
    if (!testSubcategory) {
      console.log('❌ No "pvc pipe" subcategory found for testing');
      return;
    }

    console.log(`\n🎯 Testing with: ${testCategory.name} → ${testSubcategory.name}`);

    // Step 2a: Get extended subcategories for this subcategory
    const level1Extended = await ExtendedSubcategory.find({
      category: testCategory._id,
      subcategory: testSubcategory._id,
      level: 1
    }).select('name');
    
    console.log(`\nLevel 1 Extended Subcategories: ${level1Extended.length}`);
    level1Extended.forEach(ext => console.log(`  - ${ext.name} (${ext._id})`));

    // Step 2b: Get brands for basic hierarchy (category + subcategory)
    const basicBrands = await Brand.find({
      category: testCategory._id,
      subcategory: testSubcategory._id
    }).select('name subcategory1');
    
    console.log(`\nBrands for basic hierarchy: ${basicBrands.length}`);
    basicBrands.forEach(brand => console.log(`  - ${brand.name} (Extended: ${brand.subcategory1 ? 'Yes' : 'No'})`));

    // Step 2c: Get brands for extended hierarchy (with subcategory1)
    if (level1Extended.length > 0) {
      const testExtended = level1Extended[0];
      const extendedBrands = await Brand.find({
        category: testCategory._id,
        subcategory: testSubcategory._id,
        subcategory1: testExtended._id
      }).select('name');
      
      console.log(`\nBrands for extended hierarchy (${testExtended.name}): ${extendedBrands.length}`);
      extendedBrands.forEach(brand => console.log(`  - ${brand.name}`));

      // Step 2d: Test the opposite - brands with different extended subcategory
      if (level1Extended.length > 1) {
        const otherExtended = level1Extended[1];
        const otherBrands = await Brand.find({
          category: testCategory._id,
          subcategory: testSubcategory._id,
          subcategory1: otherExtended._id
        }).select('name');
        
        console.log(`\nBrands for different extended hierarchy (${otherExtended.name}): ${otherBrands.length}`);
        otherBrands.forEach(brand => console.log(`  - ${brand.name}`));
      }
    }

    // 3. Test Product creation with extended hierarchy
    console.log('\n📋 Step 3: Testing Product Creation with Extended Hierarchy');
    
    const productsWithExtended = await Product.find({
      subcategory1: { $exists: true, $ne: null }
    })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .populate('subcategory1', 'name')
    .populate('brand', 'name')
    .select('itemName category subcategory subcategory1 brand');

    console.log(`\nProducts with Extended Subcategories: ${productsWithExtended.length}`);
    productsWithExtended.forEach(product => {
      const hierarchy = [
        product.category?.name,
        product.subcategory?.name,
        product.subcategory1?.name
      ].filter(Boolean).join(' → ');
      console.log(`  - ${product.itemName}: ${hierarchy} (Brand: ${product.brand?.name})`);
    });

    // 4. Check for any inconsistencies
    console.log('\n📋 Step 4: Checking for Inconsistencies');
    
    // Check if there are brands with extended subcategories that don't exist
    const brandsWithInvalidExtended = await Brand.find({
      subcategory1: { $exists: true, $ne: null }
    }).populate('subcategory1');
    
    const invalidBrands = brandsWithInvalidExtended.filter(brand => !brand.subcategory1);
    if (invalidBrands.length > 0) {
      console.log(`\n⚠️  Brands with invalid extended subcategory references: ${invalidBrands.length}`);
      invalidBrands.forEach(brand => console.log(`  - ${brand.name}`));
    } else {
      console.log('\n✅ All brand extended subcategory references are valid');
    }

    // Check if there are products with extended subcategories that don't exist
    const productsWithInvalidExtended = await Product.find({
      subcategory1: { $exists: true, $ne: null }
    }).populate('subcategory1');
    
    const invalidProducts = productsWithInvalidExtended.filter(product => !product.subcategory1);
    if (invalidProducts.length > 0) {
      console.log(`\n⚠️  Products with invalid extended subcategory references: ${invalidProducts.length}`);
      invalidProducts.forEach(product => console.log(`  - ${product.itemName}`));
    } else {
      console.log('\n✅ All product extended subcategory references are valid');
    }

    console.log('\n✅ Complete hierarchy test finished!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
};

testCompleteHierarchy();