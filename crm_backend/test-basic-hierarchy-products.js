import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testBasicHierarchyProducts = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING BASIC HIERARCHY PRODUCTS (Brand → Category → Subcategory ONLY)');
    console.log('='.repeat(80));
    
    // 1. Find Test Brand, Test Category, Test Subcategory
    console.log('\n📋 Step 1: Finding Test Hierarchy...');
    
    const testBrand = await Brand.findOne({ name: /test/i });
    console.log('🏢 Test Brand:', testBrand ? `${testBrand.name} (${testBrand._id})` : 'NOT FOUND');
    
    if (!testBrand) {
      console.log('❌ Test Brand not found, cannot proceed');
      return;
    }
    
    const testCategory = await Category.findOne({ 
      name: /test/i,
      brandId: testBrand._id 
    });
    console.log('📁 Test Category:', testCategory ? `${testCategory.name} (${testCategory._id})` : 'NOT FOUND');
    
    if (!testCategory) {
      console.log('❌ Test Category not found, cannot proceed');
      return;
    }
    
    const testSubcategory = await Subcategory.findOne({ 
      name: /test/i,
      brandId: testBrand._id,
      categoryId: testCategory._id
    });
    console.log('📂 Test Subcategory:', testSubcategory ? `${testSubcategory.name} (${testSubcategory._id})` : 'NOT FOUND');
    
    if (!testSubcategory) {
      console.log('❌ Test Subcategory not found, cannot proceed');
      return;
    }
    
    // 2. Find ALL products in this hierarchy
    console.log('\n📦 Step 2: Finding ALL Products in Test Hierarchy...');
    
    const allProducts = await Product.find({
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id
    }).select('productCode itemName brand category subcategory subcategory1 subcategory2 subcategory3');
    
    console.log(`📊 Total products in ${testBrand.name} → ${testCategory.name} → ${testSubcategory.name}:`, allProducts.length);
    
    if (allProducts.length === 0) {
      console.log('❌ No products found in test hierarchy');
      return;
    }
    
    // 3. Analyze product structure
    console.log('\n🔍 Step 3: Analyzing Product Structure...');
    
    const productsWithoutExtended = allProducts.filter(p => 
      !p.subcategory1 && !p.subcategory2 && !p.subcategory3
    );
    
    const productsWithExtended = allProducts.filter(p => 
      p.subcategory1 || p.subcategory2 || p.subcategory3
    );
    
    console.log('📈 Products Analysis:');
    console.log(`  - Products with ONLY basic hierarchy (Brand→Category→Subcategory): ${productsWithoutExtended.length}`);
    console.log(`  - Products with extended levels: ${productsWithExtended.length}`);
    
    console.log('\n📋 Products with ONLY basic hierarchy:');
    productsWithoutExtended.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Extended levels: subcategory1=${product.subcategory1 || 'null'}, subcategory2=${product.subcategory2 || 'null'}, subcategory3=${product.subcategory3 || 'null'}`);
    });
    
    console.log('\n📋 Products with extended levels:');
    productsWithExtended.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Extended levels: subcategory1=${product.subcategory1 || 'null'}, subcategory2=${product.subcategory2 || 'null'}, subcategory3=${product.subcategory3 || 'null'}`);
    });
    
    // 4. Find test dealer
    console.log('\n👤 Step 4: Finding Test Dealer...');
    
    const testDealer = await Dealer.findOne({ name: /test/i })
      .populate('allowedBrands', 'name')
      .populate('allowedCategories', 'name')
      .populate('allowedSubcategories', 'name')
      .populate('allowedExtendedSubcategories', 'name level');
    
    if (!testDealer) {
      console.log('❌ Test dealer not found');
      return;
    }
    
    console.log('👤 Test Dealer:', testDealer.name);
    console.log('📊 Dealer Permissions:');
    console.log(`  - Allowed Brands: ${testDealer.allowedBrands?.length || 0}`);
    console.log(`  - Allowed Categories: ${testDealer.allowedCategories?.length || 0}`);
    console.log(`  - Allowed Subcategories: ${testDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Allowed Extended Subcategories: ${testDealer.allowedExtendedSubcategories?.length || 0}`);
    
    // Check if dealer has permission for test hierarchy
    const hasBrandPermission = testDealer.allowedBrands?.some(b => b._id.toString() === testBrand._id.toString());
    const hasCategoryPermission = testDealer.allowedCategories?.some(c => c._id.toString() === testCategory._id.toString());
    const hasSubcategoryPermission = testDealer.allowedSubcategories?.some(s => s._id.toString() === testSubcategory._id.toString());
    
    console.log('\n🔐 Permission Check:');
    console.log(`  - Has Test Brand permission: ${hasBrandPermission}`);
    console.log(`  - Has Test Category permission: ${hasCategoryPermission}`);
    console.log(`  - Has Test Subcategory permission: ${hasSubcategoryPermission}`);
    console.log(`  - Has Extended permissions: ${testDealer.allowedExtendedSubcategories?.length > 0}`);
    
    // 5. Test current filtering logic
    console.log('\n🧪 Step 5: Testing Current Filtering Logic...');
    
    // Simulate the current backend filter
    const productFilter = {
      status: 'active',
      brand: testBrand._id,
      category: testCategory._id,
      subcategory: testSubcategory._id
    };
    
    // Apply extended subcategory logic
    if (testDealer.allowedExtendedSubcategories && testDealer.allowedExtendedSubcategories.length > 0) {
      const allowedExtendedIds = testDealer.allowedExtendedSubcategories.map(ext => ext._id);
      productFilter.subcategory1 = { $in: allowedExtendedIds };
      console.log('🔍 Applied extended filter (dealer HAS extended permissions):', allowedExtendedIds);
    } else {
      productFilter.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
      console.log('🔍 Applied basic filter (dealer has NO extended permissions): show products with NO extended levels');
    }
    
    console.log('🔍 Final filter:', JSON.stringify(productFilter, null, 2));
    
    // Execute the filter
    const filteredProducts = await Product.find(productFilter)
      .select('productCode itemName subcategory1 subcategory2 subcategory3');
    
    console.log(`\n✅ Products returned by current logic: ${filteredProducts.length}`);
    
    if (filteredProducts.length > 0) {
      console.log('📋 Filtered products:');
      filteredProducts.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
        console.log(`     Extended: subcategory1=${product.subcategory1 || 'null'}`);
      });
    } else {
      console.log('❌ No products returned - this is the problem!');
    }
    
    // 6. Expected vs Actual
    console.log('\n📊 ANALYSIS:');
    console.log(`Expected: Dealer should see ${productsWithoutExtended.length} products (those with only basic hierarchy)`);
    console.log(`Actual: Dealer sees ${filteredProducts.length} products`);
    
    if (filteredProducts.length === productsWithoutExtended.length) {
      console.log('✅ WORKING CORRECTLY: Dealer sees all basic hierarchy products');
    } else {
      console.log('❌ ISSUE FOUND: Dealer is not seeing the expected products');
      
      // Check what's wrong
      if (productsWithoutExtended.length > 0 && filteredProducts.length === 0) {
        console.log('\n🔍 DEBUGGING: Why are basic products not showing?');
        
        // Check each basic product individually
        for (const product of productsWithoutExtended) {
          console.log(`\n🔍 Checking product: ${product.productCode}`);
          console.log(`  - subcategory1: ${product.subcategory1} (type: ${typeof product.subcategory1})`);
          console.log(`  - subcategory1 exists: ${product.subcategory1 !== undefined}`);
          console.log(`  - subcategory1 is null: ${product.subcategory1 === null}`);
          console.log(`  - subcategory1 is empty string: ${product.subcategory1 === ''}`);
          
          // Test individual filters
          const testFilter1 = { _id: product._id, subcategory1: { $exists: false } };
          const testFilter2 = { _id: product._id, subcategory1: null };
          
          const result1 = await Product.findOne(testFilter1);
          const result2 = await Product.findOne(testFilter2);
          
          console.log(`  - Matches {subcategory1: {$exists: false}}: ${result1 ? 'YES' : 'NO'}`);
          console.log(`  - Matches {subcategory1: null}: ${result2 ? 'YES' : 'NO'}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 TEST COMPLETE');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

testBasicHierarchyProducts();