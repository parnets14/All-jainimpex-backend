import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
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

const analyzeProductMasterVsRaviAccess = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(100));
    console.log('🔍 ANALYZING PRODUCT MASTER VS RAVI DEALER ACCESS');
    console.log('='.repeat(100));
    
    // 1. Get total products in Product Master
    console.log('\n📦 Step 1: Analyzing Product Master...');
    
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ status: 'active' });
    const inactiveProducts = totalProducts - activeProducts;
    
    console.log(`📊 Total Products in Product Master: ${totalProducts}`);
    console.log(`  - Active Products: ${activeProducts}`);
    console.log(`  - Inactive Products: ${inactiveProducts}`);
    
    // 2. Analyze products by hierarchy structure
    console.log('\n🏗️ Step 2: Analyzing Product Hierarchy Structure...');
    
    const productsWithBasicOnly = await Product.countDocuments({
      status: 'active',
      brand: { $exists: true, $ne: null },
      category: { $exists: true, $ne: null },
      subcategory: { $exists: true, $ne: null },
      $or: [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ]
    });
    
    const productsWithExtended = await Product.countDocuments({
      status: 'active',
      brand: { $exists: true, $ne: null },
      category: { $exists: true, $ne: null },
      subcategory: { $exists: true, $ne: null },
      subcategory1: { $exists: true, $ne: null }
    });
    
    const productsWithIncompleteHierarchy = await Product.countDocuments({
      status: 'active',
      $or: [
        { brand: { $exists: false } },
        { brand: null },
        { category: { $exists: false } },
        { category: null },
        { subcategory: { $exists: false } },
        { subcategory: null }
      ]
    });
    
    console.log(`📊 Product Hierarchy Analysis:`);
    console.log(`  - Products with Basic Hierarchy Only (Brand→Category→Subcategory): ${productsWithBasicOnly}`);
    console.log(`  - Products with Extended Hierarchy (has Level 1+): ${productsWithExtended}`);
    console.log(`  - Products with Incomplete Hierarchy: ${productsWithIncompleteHierarchy}`);
    console.log(`  - Total Analyzed: ${productsWithBasicOnly + productsWithExtended + productsWithIncompleteHierarchy}`);
    
    // 3. Get Ravi dealer permissions
    console.log('\n👤 Step 3: Analyzing Ravi Dealer Permissions...');
    
    const raviDealer = await Dealer.findOne({ name: /ravi/i });
    if (!raviDealer) {
      console.log('❌ Ravi dealer not found');
      return;
    }
    
    console.log(`👤 Dealer: ${raviDealer.name}`);
    console.log(`📊 Ravi's Permissions:`);
    console.log(`  - Allowed Brands: ${raviDealer.allowedBrands?.length || 0}`);
    console.log(`  - Allowed Categories: ${raviDealer.allowedCategories?.length || 0}`);
    console.log(`  - Allowed Subcategories: ${raviDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Allowed Extended Subcategories: ${raviDealer.allowedExtendedSubcategories?.length || 0}`);
    
    // 4. Get detailed hierarchy information
    console.log('\n🔍 Step 4: Detailed Hierarchy Analysis...');
    
    // Get brand names
    if (raviDealer.allowedBrands?.length > 0) {
      console.log('\n🏢 Allowed Brands:');
      for (const brandId of raviDealer.allowedBrands) {
        const brand = await Brand.findById(brandId);
        console.log(`  - ${brand?.name || 'Unknown'} (${brandId})`);
      }
    }
    
    // Get category names
    if (raviDealer.allowedCategories?.length > 0) {
      console.log('\n📁 Allowed Categories:');
      for (const categoryId of raviDealer.allowedCategories) {
        const category = await Category.findById(categoryId);
        console.log(`  - ${category?.name || 'Unknown'} (${categoryId})`);
      }
    }
    
    // Get subcategory names
    if (raviDealer.allowedSubcategories?.length > 0) {
      console.log('\n📂 Allowed Subcategories:');
      for (const subcategoryId of raviDealer.allowedSubcategories) {
        const subcategory = await Subcategory.findById(subcategoryId);
        console.log(`  - ${subcategory?.name || 'Unknown'} (${subcategoryId})`);
      }
    }
    
    // Get extended subcategory names
    if (raviDealer.allowedExtendedSubcategories?.length > 0) {
      console.log('\n🔧 Allowed Extended Subcategories:');
      for (const extendedId of raviDealer.allowedExtendedSubcategories) {
        const extended = await ExtendedSubcategory.findById(extendedId);
        console.log(`  - ${extended?.name || 'Unknown'} Level ${extended?.level || '?'} (${extendedId})`);
      }
    }
    
    // 5. Calculate what Ravi SHOULD have access to
    console.log('\n🧮 Step 5: Calculating Expected Access...');
    
    // Products matching Ravi's brand permissions
    let expectedProducts = 0;
    if (raviDealer.allowedBrands?.length > 0) {
      const brandProducts = await Product.countDocuments({
        status: 'active',
        brand: { $in: raviDealer.allowedBrands }
      });
      console.log(`📊 Products in allowed brands: ${brandProducts}`);
      
      // Products matching brand + category
      if (raviDealer.allowedCategories?.length > 0) {
        const brandCategoryProducts = await Product.countDocuments({
          status: 'active',
          brand: { $in: raviDealer.allowedBrands },
          category: { $in: raviDealer.allowedCategories }
        });
        console.log(`📊 Products in allowed brands + categories: ${brandCategoryProducts}`);
        
        // Products matching brand + category + subcategory
        if (raviDealer.allowedSubcategories?.length > 0) {
          const brandCategorySubcategoryProducts = await Product.countDocuments({
            status: 'active',
            brand: { $in: raviDealer.allowedBrands },
            category: { $in: raviDealer.allowedCategories },
            subcategory: { $in: raviDealer.allowedSubcategories }
          });
          console.log(`📊 Products in allowed brands + categories + subcategories: ${brandCategorySubcategoryProducts}`);
          
          // Products with extended subcategories (what Ravi actually gets)
          if (raviDealer.allowedExtendedSubcategories?.length > 0) {
            const finalProducts = await Product.countDocuments({
              status: 'active',
              brand: { $in: raviDealer.allowedBrands },
              category: { $in: raviDealer.allowedCategories },
              subcategory: { $in: raviDealer.allowedSubcategories },
              subcategory1: { $in: raviDealer.allowedExtendedSubcategories }
            });
            expectedProducts = finalProducts;
            console.log(`📊 Products with allowed extended subcategories (FINAL): ${finalProducts}`);
          } else {
            // Products without extended subcategories
            const basicProducts = await Product.countDocuments({
              status: 'active',
              brand: { $in: raviDealer.allowedBrands },
              category: { $in: raviDealer.allowedCategories },
              subcategory: { $in: raviDealer.allowedSubcategories },
              $or: [
                { subcategory1: { $exists: false } },
                { subcategory1: null }
              ]
            });
            expectedProducts = basicProducts;
            console.log(`📊 Products without extended subcategories (FINAL): ${basicProducts}`);
          }
        }
      }
    }
    
    // 6. Compare with actual API result
    console.log('\n⚖️ Step 6: Comparing Expected vs Actual...');
    
    const actualFilter = {
      status: 'active',
      brand: { $in: raviDealer.allowedBrands },
      category: { $in: raviDealer.allowedCategories },
      subcategory: { $in: raviDealer.allowedSubcategories },
      subcategory1: { $in: raviDealer.allowedExtendedSubcategories }
    };
    
    const actualProducts = await Product.countDocuments(actualFilter);
    
    console.log(`📊 COMPARISON:`);
    console.log(`  - Expected Products: ${expectedProducts}`);
    console.log(`  - Actual API Result: ${actualProducts}`);
    console.log(`  - Match: ${expectedProducts === actualProducts ? '✅ YES' : '❌ NO'}`);
    
    // 7. Sample products that Ravi can access
    console.log('\n📋 Step 7: Sample Products Ravi Can Access...');
    
    const sampleProducts = await Product.find(actualFilter)
      .select('productCode itemName brand category subcategory subcategory1')
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(10);
    
    console.log(`📦 Sample Products (first 10 of ${actualProducts}):`);
    sampleProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
      console.log(`     Hierarchy: ${product.brand?.name} → ${product.category?.name} → ${product.subcategory?.name}`);
      console.log(`     Extended L1: ${product.subcategory1 || 'null'}`);
    });
    
    // 8. Check for products that might be missing
    console.log('\n🔍 Step 8: Checking for Missing Products...');
    
    // Products in allowed hierarchy but without extended subcategories
    const potentiallyMissing = await Product.countDocuments({
      status: 'active',
      brand: { $in: raviDealer.allowedBrands },
      category: { $in: raviDealer.allowedCategories },
      subcategory: { $in: raviDealer.allowedSubcategories },
      $or: [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ]
    });
    
    console.log(`📊 Products in allowed hierarchy but WITHOUT extended subcategories: ${potentiallyMissing}`);
    
    if (potentiallyMissing > 0) {
      console.log(`⚠️ These ${potentiallyMissing} products are NOT accessible to Ravi because:`);
      console.log(`   - They have basic hierarchy only (Brand→Category→Subcategory)`);
      console.log(`   - Ravi has extended subcategory permissions`);
      console.log(`   - Current logic only shows products WITH extended subcategories`);
      
      const missingSample = await Product.find({
        status: 'active',
        brand: { $in: raviDealer.allowedBrands },
        category: { $in: raviDealer.allowedCategories },
        subcategory: { $in: raviDealer.allowedSubcategories },
        $or: [
          { subcategory1: { $exists: false } },
          { subcategory1: null }
        ]
      }).select('productCode itemName brand category subcategory subcategory1')
        .populate('brand', 'name')
        .populate('category', 'name')
        .populate('subcategory', 'name')
        .limit(5);
      
      console.log(`📦 Sample Missing Products (first 5 of ${potentiallyMissing}):`);
      missingSample.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
        console.log(`     Hierarchy: ${product.brand?.name} → ${product.category?.name} → ${product.subcategory?.name}`);
        console.log(`     Extended L1: ${product.subcategory1 || 'null'} (missing!)`);
      });
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('🏁 ANALYSIS COMPLETE');
    console.log('='.repeat(100));
    
    console.log('\n📊 SUMMARY:');
    console.log(`✅ Total Products in System: ${totalProducts} (${activeProducts} active)`);
    console.log(`✅ Products with Basic Hierarchy: ${productsWithBasicOnly}`);
    console.log(`✅ Products with Extended Hierarchy: ${productsWithExtended}`);
    console.log(`✅ Ravi's Accessible Products: ${actualProducts}`);
    console.log(`✅ Potentially Missing Products: ${potentiallyMissing}`);
    
    if (potentiallyMissing > 0) {
      console.log('\n🚨 ISSUE IDENTIFIED:');
      console.log(`   Ravi could potentially access ${actualProducts + potentiallyMissing} products`);
      console.log(`   But current logic only gives access to ${actualProducts} products`);
      console.log(`   Missing ${potentiallyMissing} products with basic hierarchy only`);
    } else {
      console.log('\n✅ NO ISSUES: Ravi has access to all expected products');
    }
    
  } catch (error) {
    console.error('❌ Error in analysis:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

analyzeProductMasterVsRaviAccess();