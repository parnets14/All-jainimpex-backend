import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import Dealer from './models/Dealer.js';

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

const testRaviDealerProducts = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING RAVI DEALER PRODUCT ACCESS');
    console.log('='.repeat(80));
    
    // 1. Get Ravi dealer details
    console.log('\n👤 Step 1: Getting Ravi Dealer Details...');
    const raviDealer = await Dealer.findOne({ name: /ravi/i });
    
    if (!raviDealer) {
      console.log('❌ Ravi dealer not found');
      return;
    }
    
    console.log('👤 Dealer:', raviDealer.name);
    console.log('📊 Permissions:');
    console.log(`  - Brands: ${raviDealer.allowedBrands?.length || 0}`);
    console.log(`  - Categories: ${raviDealer.allowedCategories?.length || 0}`);
    console.log(`  - Subcategories: ${raviDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Extended: ${raviDealer.allowedExtendedSubcategories?.length || 0}`);
    
    if (raviDealer.allowedBrands?.length > 0) {
      console.log('  Allowed Brand IDs:', raviDealer.allowedBrands.map(id => id.toString()));
    }
    if (raviDealer.allowedCategories?.length > 0) {
      console.log('  Allowed Category IDs:', raviDealer.allowedCategories.map(id => id.toString()));
    }
    if (raviDealer.allowedSubcategories?.length > 0) {
      console.log('  Allowed Subcategory IDs:', raviDealer.allowedSubcategories.map(id => id.toString()));
    }
    if (raviDealer.allowedExtendedSubcategories?.length > 0) {
      console.log('  Allowed Extended IDs:', raviDealer.allowedExtendedSubcategories.map(id => id.toString()));
    }
    
    // 2. Test current backend filtering logic
    console.log('\n🧪 Step 2: Testing Current Backend Filtering Logic...');
    
    // Simulate the current getDealerAccessibleProducts logic
    const productFilter = {
      status: 'active'
    };
    
    // Apply brand filter
    if (raviDealer.allowedBrands && raviDealer.allowedBrands.length > 0) {
      productFilter.brand = { $in: raviDealer.allowedBrands };
      console.log('🔍 Added brand filter:', raviDealer.allowedBrands.length, 'brands');
    }
    
    // Apply category filter
    if (raviDealer.allowedCategories && raviDealer.allowedCategories.length > 0) {
      productFilter.category = { $in: raviDealer.allowedCategories };
      console.log('🔍 Added category filter:', raviDealer.allowedCategories.length, 'categories');
    }
    
    // Apply subcategory filter
    if (raviDealer.allowedSubcategories && raviDealer.allowedSubcategories.length > 0) {
      productFilter.subcategory = { $in: raviDealer.allowedSubcategories };
      console.log('🔍 Added subcategory filter:', raviDealer.allowedSubcategories.length, 'subcategories');
    }
    
    // Apply extended subcategory logic
    if (raviDealer.allowedExtendedSubcategories && raviDealer.allowedExtendedSubcategories.length > 0) {
      productFilter.subcategory1 = { $in: raviDealer.allowedExtendedSubcategories };
      console.log('🔍 Applied extended filter (dealer HAS extended permissions):', raviDealer.allowedExtendedSubcategories.length, 'extended');
    } else {
      productFilter.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
      console.log('🔍 Applied basic filter (dealer has NO extended permissions)');
    }
    
    console.log('🔍 Final filter:', JSON.stringify(productFilter, null, 2));
    
    // Execute the filter
    const filteredProducts = await Product.find(productFilter)
      .select('productCode itemName subcategory1 subcategory2 subcategory3 brand category subcategory')
      .limit(20); // Limit to first 20 for display
    
    console.log(`\n✅ Products returned by current logic: ${filteredProducts.length}`);
    
    if (filteredProducts.length > 0) {
      console.log('📋 Sample filtered products (first 10):');
      filteredProducts.slice(0, 10).forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
        console.log(`     Brand: ${product.brand}, Category: ${product.category}, Subcategory: ${product.subcategory}`);
        console.log(`     Extended: L1=${product.subcategory1 || 'null'}, L2=${product.subcategory2 || 'null'}, L3=${product.subcategory3 || 'null'}`);
      });
      
      if (filteredProducts.length > 10) {
        console.log(`     ... and ${filteredProducts.length - 10} more products`);
      }
    } else {
      console.log('❌ No products returned');
    }
    
    // 3. Get total count
    const totalCount = await Product.countDocuments(productFilter);
    console.log(`\n📊 Total products accessible to Ravi: ${totalCount}`);
    
    // 4. Compare with Suman
    console.log('\n🔍 Step 3: Comparing with Suman Dealer...');
    const sumanDealer = await Dealer.findOne({ name: /suman/i });
    
    if (sumanDealer) {
      const sumanFilter = {
        status: 'active',
        brand: { $in: sumanDealer.allowedBrands },
        category: { $in: sumanDealer.allowedCategories },
        subcategory: { $in: sumanDealer.allowedSubcategories },
        $or: [
          { subcategory1: { $exists: false } },
          { subcategory1: null }
        ]
      };
      
      const sumanCount = await Product.countDocuments(sumanFilter);
      console.log(`📊 Suman accessible products: ${sumanCount}`);
      console.log(`📊 Ravi accessible products: ${totalCount}`);
      console.log(`📊 Difference: ${totalCount - sumanCount} more products for Ravi`);
    }
    
    // 5. Analyze by hierarchy level
    console.log('\n🔍 Step 4: Analyzing Products by Hierarchy Level...');
    
    // Products with basic hierarchy only
    const basicFilter = {
      ...productFilter,
      $or: [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ]
    };
    delete basicFilter.subcategory1; // Remove the extended filter
    
    const basicCount = await Product.countDocuments(basicFilter);
    console.log(`📊 Products with basic hierarchy only: ${basicCount}`);
    
    // Products with extended hierarchy
    const extendedFilter = {
      ...productFilter
    };
    delete extendedFilter.$or; // Remove the basic filter
    
    const extendedCount = await Product.countDocuments(extendedFilter);
    console.log(`📊 Products with extended hierarchy: ${extendedCount}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 RAVI DEALER TEST COMPLETE');
    console.log('='.repeat(80));
    
    console.log('\n📊 SUMMARY:');
    console.log(`✅ Ravi dealer has extensive permissions:`);
    console.log(`   - ${raviDealer.allowedBrands?.length || 0} brands`);
    console.log(`   - ${raviDealer.allowedCategories?.length || 0} categories`);
    console.log(`   - ${raviDealer.allowedSubcategories?.length || 0} subcategories`);
    console.log(`   - ${raviDealer.allowedExtendedSubcategories?.length || 0} extended subcategories`);
    console.log(`✅ Total accessible products: ${totalCount}`);
    console.log(`✅ This should work in Sales Order Dashboard`);
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

testRaviDealerProducts();