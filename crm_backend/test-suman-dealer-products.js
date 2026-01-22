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

const testSumanDealerProducts = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 TESTING SUMAN DEALER PRODUCT ACCESS');
    console.log('='.repeat(80));
    
    // 1. Get Suman dealer details
    console.log('\n👤 Step 1: Getting Suman Dealer Details...');
    const sumanDealer = await Dealer.findOne({ name: /suman/i });
    
    if (!sumanDealer) {
      console.log('❌ Suman dealer not found');
      return;
    }
    
    console.log('👤 Dealer:', sumanDealer.name);
    console.log('📊 Permissions:');
    console.log(`  - Brands: ${sumanDealer.allowedBrands?.length || 0}`);
    console.log(`  - Categories: ${sumanDealer.allowedCategories?.length || 0}`);
    console.log(`  - Subcategories: ${sumanDealer.allowedSubcategories?.length || 0}`);
    console.log(`  - Extended: ${sumanDealer.allowedExtendedSubcategories?.length || 0}`);
    
    if (sumanDealer.allowedBrands?.length > 0) {
      console.log('  Allowed Brand ID:', sumanDealer.allowedBrands[0]);
    }
    if (sumanDealer.allowedCategories?.length > 0) {
      console.log('  Allowed Category ID:', sumanDealer.allowedCategories[0]);
    }
    if (sumanDealer.allowedSubcategories?.length > 0) {
      console.log('  Allowed Subcategory ID:', sumanDealer.allowedSubcategories[0]);
    }
    
    // 2. Find ALL products in this hierarchy
    console.log('\n📦 Step 2: Finding ALL Products in Test Hierarchy...');
    const brandId = sumanDealer.allowedBrands[0];
    const categoryId = sumanDealer.allowedCategories[0];
    const subcategoryId = sumanDealer.allowedSubcategories[0];
    
    const allProducts = await Product.find({
      brand: brandId,
      category: categoryId,
      subcategory: subcategoryId
    }).select('productCode itemName brand category subcategory subcategory1 subcategory2 subcategory3');
    
    console.log(`📊 Total products in hierarchy: ${allProducts.length}`);
    
    if (allProducts.length === 0) {
      console.log('❌ No products found in this hierarchy - this explains why dealer sees no products!');
      
      // Let's check if there are any products with this brand/category/subcategory at all
      console.log('\n🔍 Checking for products with individual hierarchy components...');
      
      const brandProducts = await Product.find({ brand: brandId }).limit(5);
      console.log(`Products with Test Brand: ${brandProducts.length}`);
      
      const categoryProducts = await Product.find({ category: categoryId }).limit(5);
      console.log(`Products with Test Category: ${categoryProducts.length}`);
      
      const subcategoryProducts = await Product.find({ subcategory: subcategoryId }).limit(5);
      console.log(`Products with Test Subcategory: ${subcategoryProducts.length}`);
      
      return;
    }
    
    // 3. Analyze product structure
    console.log('\n🔍 Step 3: Analyzing Product Structure...');
    
    for (const product of allProducts) {
      console.log(`\n📦 Product: ${product.productCode} - ${product.itemName}`);
      console.log(`  Brand: ${product.brand}`);
      console.log(`  Category: ${product.category}`);
      console.log(`  Subcategory: ${product.subcategory}`);
      console.log(`  Extended L1: ${product.subcategory1 || 'null'}`);
      console.log(`  Extended L2: ${product.subcategory2 || 'null'}`);
      console.log(`  Extended L3: ${product.subcategory3 || 'null'}`);
      
      const hasExtended = product.subcategory1 || product.subcategory2 || product.subcategory3;
      console.log(`  Type: ${hasExtended ? 'HAS EXTENDED LEVELS' : 'BASIC HIERARCHY ONLY'}`);
    }
    
    const basicProducts = allProducts.filter(p => 
      !p.subcategory1 && !p.subcategory2 && !p.subcategory3
    );
    
    const extendedProducts = allProducts.filter(p => 
      p.subcategory1 || p.subcategory2 || p.subcategory3
    );
    
    console.log(`\n📈 Summary:`);
    console.log(`  - Products with ONLY basic hierarchy: ${basicProducts.length}`);
    console.log(`  - Products with extended levels: ${extendedProducts.length}`);
    
    // 4. Test current backend filtering logic
    console.log('\n🧪 Step 4: Testing Current Backend Filtering Logic...');
    
    // Simulate the current getDealerAccessibleProducts logic
    const productFilter = {
      status: 'active',
      brand: brandId,
      category: categoryId,
      subcategory: subcategoryId
    };
    
    // Apply extended subcategory logic (Suman has NO extended permissions)
    if (sumanDealer.allowedExtendedSubcategories && sumanDealer.allowedExtendedSubcategories.length > 0) {
      const allowedExtendedIds = sumanDealer.allowedExtendedSubcategories;
      productFilter.subcategory1 = { $in: allowedExtendedIds };
      console.log('🔍 Applied extended filter (dealer HAS extended permissions)');
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
      .select('productCode itemName subcategory1 subcategory2 subcategory3');
    
    console.log(`\n✅ Products returned by current logic: ${filteredProducts.length}`);
    
    if (filteredProducts.length > 0) {
      console.log('📋 Filtered products:');
      filteredProducts.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.productCode} - ${product.itemName}`);
        console.log(`     Extended: L1=${product.subcategory1 || 'null'}, L2=${product.subcategory2 || 'null'}, L3=${product.subcategory3 || 'null'}`);
      });
    } else {
      console.log('❌ No products returned - this is the issue!');
    }
    
    // 5. Expected vs Actual
    console.log('\n📊 ANALYSIS:');
    console.log(`Expected: Dealer should see ${basicProducts.length} products (those with only basic hierarchy)`);
    console.log(`Actual: Dealer sees ${filteredProducts.length} products`);
    
    if (filteredProducts.length === basicProducts.length && basicProducts.length > 0) {
      console.log('✅ WORKING CORRECTLY: Dealer sees all basic hierarchy products');
    } else if (basicProducts.length === 0 && extendedProducts.length > 0) {
      console.log('⚠️ EXPECTED BEHAVIOR: All products in this hierarchy have extended levels, so dealer with no extended permissions should see 0 products');
    } else {
      console.log('❌ ISSUE FOUND: Dealer is not seeing the expected products');
      
      if (basicProducts.length > 0) {
        console.log('\n🔍 DEBUGGING: Why are basic products not showing?');
        
        // Test each basic product individually
        for (const product of basicProducts) {
          console.log(`\n🔍 Testing product: ${product.productCode}`);
          
          // Test individual conditions
          const test1 = await Product.findOne({ 
            _id: product._id, 
            subcategory1: { $exists: false } 
          });
          const test2 = await Product.findOne({ 
            _id: product._id, 
            subcategory1: null 
          });
          
          console.log(`  subcategory1 value: "${product.subcategory1}" (type: ${typeof product.subcategory1})`);
          console.log(`  Matches {subcategory1: {$exists: false}}: ${test1 ? 'YES' : 'NO'}`);
          console.log(`  Matches {subcategory1: null}: ${test2 ? 'YES' : 'NO'}`);
        }
      }
    }
    
    // 6. Test the Sales Executive App backend logic too
    console.log('\n🧪 Step 5: Testing Sales Executive App Backend Logic...');
    
    // Simulate the Sales Executive App getProducts logic
    const seAppFilter = {
      status: 'active',
      brand: { $in: [brandId] },
      category: { $in: [categoryId] },
      subcategory: { $in: [subcategoryId] }
    };
    
    // Apply extended subcategory logic for SE App
    if (sumanDealer.allowedExtendedSubcategories && sumanDealer.allowedExtendedSubcategories.length > 0) {
      seAppFilter.subcategory1 = { $in: sumanDealer.allowedExtendedSubcategories };
      console.log('🔍 SE App: Applied extended filter');
    } else {
      seAppFilter.$or = [
        { subcategory1: { $exists: false } },
        { subcategory1: null }
      ];
      console.log('🔍 SE App: Applied basic filter');
    }
    
    console.log('🔍 SE App filter:', JSON.stringify(seAppFilter, null, 2));
    
    const seAppProducts = await Product.find(seAppFilter)
      .select('productCode itemName subcategory1');
    
    console.log(`📱 Sales Executive App would return: ${seAppProducts.length} products`);
    
    console.log('\n' + '='.repeat(80));
    console.log('🏁 TEST COMPLETE');
    console.log('='.repeat(80));
    
    if (basicProducts.length > 0 && filteredProducts.length === 0) {
      console.log('\n🚨 ISSUE CONFIRMED:');
      console.log('   - There ARE products with only basic hierarchy');
      console.log('   - But the filtering logic is NOT returning them');
      console.log('   - This explains why Sales Order Dashboard shows no products');
    } else if (basicProducts.length === 0) {
      console.log('\n✅ NO ISSUE:');
      console.log('   - All products in this hierarchy have extended levels');
      console.log('   - Dealer has no extended permissions');
      console.log('   - Therefore, showing 0 products is correct behavior');
    }
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

testSumanDealerProducts();