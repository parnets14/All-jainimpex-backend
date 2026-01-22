import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

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

const findActualHierarchy = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 FINDING ACTUAL HIERARCHY STRUCTURE');
    console.log('='.repeat(80));
    
    // 1. Find a dealer with permissions to understand the structure
    console.log('\n👤 Step 1: Finding Dealers with Product Permissions...');
    const dealersWithPermissions = await Dealer.find({
      $or: [
        { allowedBrands: { $exists: true, $ne: [] } },
        { allowedCategories: { $exists: true, $ne: [] } },
        { allowedSubcategories: { $exists: true, $ne: [] } }
      ]
    }).populate('allowedBrands allowedCategories allowedSubcategories allowedExtendedSubcategories')
      .limit(5);
    
    console.log(`Found ${dealersWithPermissions.length} dealers with permissions:`);
    
    for (const dealer of dealersWithPermissions) {
      console.log(`\n👤 Dealer: ${dealer.name}`);
      console.log(`  - Brands: ${dealer.allowedBrands?.length || 0}`);
      console.log(`  - Categories: ${dealer.allowedCategories?.length || 0}`);
      console.log(`  - Subcategories: ${dealer.allowedSubcategories?.length || 0}`);
      console.log(`  - Extended: ${dealer.allowedExtendedSubcategories?.length || 0}`);
      
      if (dealer.allowedBrands?.length > 0) {
        console.log(`  Allowed Brands:`);
        dealer.allowedBrands.forEach(brand => {
          console.log(`    - ${brand.name} (${brand._id})`);
        });
      }
      
      if (dealer.allowedCategories?.length > 0) {
        console.log(`  Allowed Categories:`);
        dealer.allowedCategories.forEach(category => {
          console.log(`    - ${category.name} (${category._id})`);
        });
      }
      
      if (dealer.allowedSubcategories?.length > 0) {
        console.log(`  Allowed Subcategories:`);
        dealer.allowedSubcategories.forEach(subcategory => {
          console.log(`    - ${subcategory.name} (${subcategory._id})`);
        });
      }
      
      if (dealer.allowedExtendedSubcategories?.length > 0) {
        console.log(`  Allowed Extended:`);
        dealer.allowedExtendedSubcategories.forEach(extended => {
          console.log(`    - ${extended.name} Level ${extended.level} (${extended._id})`);
        });
      }
    }
    
    // 2. Find products and their hierarchy
    console.log('\n📦 Step 2: Finding Products with Hierarchy...');
    const products = await Product.find({})
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .select('productCode itemName brand category subcategory subcategory1 subcategory2 subcategory3')
      .limit(10);
    
    console.log(`Found ${products.length} sample products:`);
    
    for (const product of products) {
      console.log(`\n📦 Product: ${product.productCode} - ${product.itemName}`);
      console.log(`  Brand: ${product.brand?.name || 'N/A'} (${product.brand?._id || 'N/A'})`);
      console.log(`  Category: ${product.category?.name || 'N/A'} (${product.category?._id || 'N/A'})`);
      console.log(`  Subcategory: ${product.subcategory?.name || 'N/A'} (${product.subcategory?._id || 'N/A'})`);
      console.log(`  Extended L1: ${product.subcategory1 || 'null'}`);
      console.log(`  Extended L2: ${product.subcategory2 || 'null'}`);
      console.log(`  Extended L3: ${product.subcategory3 || 'null'}`);
      
      const hasExtended = product.subcategory1 || product.subcategory2 || product.subcategory3;
      console.log(`  Type: ${hasExtended ? 'HAS EXTENDED LEVELS' : 'BASIC HIERARCHY ONLY'}`);
    }
    
    // 3. Find products with basic hierarchy only
    console.log('\n🎯 Step 3: Finding Products with BASIC Hierarchy Only...');
    const basicProducts = await Product.find({
      $and: [
        { brand: { $exists: true, $ne: null } },
        { category: { $exists: true, $ne: null } },
        { subcategory: { $exists: true, $ne: null } },
        { 
          $or: [
            { subcategory1: { $exists: false } },
            { subcategory1: null },
            { subcategory1: '' }
          ]
        },
        { 
          $or: [
            { subcategory2: { $exists: false } },
            { subcategory2: null },
            { subcategory2: '' }
          ]
        },
        { 
          $or: [
            { subcategory3: { $exists: false } },
            { subcategory3: null },
            { subcategory3: '' }
          ]
        }
      ]
    }).populate('brand category subcategory', 'name')
      .select('productCode itemName brand category subcategory subcategory1')
      .limit(5);
    
    console.log(`Found ${basicProducts.length} products with BASIC hierarchy only:`);
    
    for (const product of basicProducts) {
      console.log(`\n✅ BASIC Product: ${product.productCode} - ${product.itemName}`);
      console.log(`  Hierarchy: ${product.brand?.name} → ${product.category?.name} → ${product.subcategory?.name}`);
      console.log(`  IDs: Brand=${product.brand?._id}, Category=${product.category?._id}, Subcategory=${product.subcategory?._id}`);
      console.log(`  Extended L1: ${product.subcategory1} (should be null/undefined)`);
    }
    
    // 4. If we found basic products, let's test the filtering logic
    if (basicProducts.length > 0) {
      const testProduct = basicProducts[0];
      console.log(`\n🧪 Step 4: Testing Filter Logic with ${testProduct.productCode}...`);
      
      // Test the current filter logic
      const testFilter = {
        brand: testProduct.brand._id,
        category: testProduct.category._id,
        subcategory: testProduct.subcategory._id,
        $or: [
          { subcategory1: { $exists: false } },
          { subcategory1: null }
        ]
      };
      
      console.log('🔍 Test filter:', JSON.stringify(testFilter, null, 2));
      
      const filteredResult = await Product.find(testFilter)
        .select('productCode itemName subcategory1');
      
      console.log(`📊 Filter result: ${filteredResult.length} products found`);
      
      if (filteredResult.length > 0) {
        console.log('✅ FILTER WORKS: Basic products are being found correctly');
        filteredResult.forEach(p => {
          console.log(`  - ${p.productCode}: subcategory1=${p.subcategory1}`);
        });
      } else {
        console.log('❌ FILTER ISSUE: Basic products are not being found');
        
        // Debug the specific product
        console.log('\n🔍 Debugging specific product...');
        const debugProduct = await Product.findById(testProduct._id)
          .select('productCode subcategory1');
        
        console.log(`Product ${debugProduct.productCode}:`);
        console.log(`  subcategory1 value: ${debugProduct.subcategory1}`);
        console.log(`  subcategory1 type: ${typeof debugProduct.subcategory1}`);
        console.log(`  subcategory1 === null: ${debugProduct.subcategory1 === null}`);
        console.log(`  subcategory1 === undefined: ${debugProduct.subcategory1 === undefined}`);
        
        // Test individual conditions
        const test1 = await Product.findOne({ 
          _id: testProduct._id, 
          subcategory1: { $exists: false } 
        });
        const test2 = await Product.findOne({ 
          _id: testProduct._id, 
          subcategory1: null 
        });
        
        console.log(`  Matches {subcategory1: {$exists: false}}: ${test1 ? 'YES' : 'NO'}`);
        console.log(`  Matches {subcategory1: null}: ${test2 ? 'YES' : 'NO'}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 HIERARCHY ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error in analysis:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

findActualHierarchy();