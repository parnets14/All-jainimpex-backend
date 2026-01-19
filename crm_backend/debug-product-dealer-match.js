import mongoose from 'mongoose';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import dotenv from 'dotenv';

dotenv.config();

const debugProductDealerMatch = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected');

    // Get the specific dealer
    const dealerId = '696b5f0960e36a636124e842'; // Ravi Ranjan Rai
    const dealer = await Dealer.findById(dealerId)
      .populate('allowedBrands', '_id name')
      .populate('allowedCategories', '_id name')
      .populate('allowedSubcategories', '_id name')
      .populate('allowedExtendedSubcategories', '_id name level');

    if (!dealer) {
      console.log('❌ Dealer not found');
      return;
    }

    console.log('\n🔍 DEALER ANALYSIS');
    console.log('Dealer:', dealer.name);
    console.log('Allowed Brands:', dealer.allowedBrands?.map(b => `${b.name} (${b._id})`));
    console.log('Allowed Categories:', dealer.allowedCategories?.map(c => `${c.name} (${c._id})`));
    console.log('Allowed Subcategories:', dealer.allowedSubcategories?.map(s => `${s.name} (${s._id})`));
    console.log('Allowed Extended:', dealer.allowedExtendedSubcategories?.map(e => `${e.name} (${e._id})`));

    // Get all products to see their structure
    const allProducts = await Product.find({ isActive: true })
      .populate('brandId', 'name')
      .populate('categoryId', 'name')
      .populate('subcategoryId', 'name')
      .populate('extendedSubcategoryId', 'name level')
      .select('itemName itemCode brandId categoryId subcategoryId extendedSubcategoryId')
      .limit(10);

    console.log('\n📦 PRODUCT ANALYSIS (First 10 products)');
    allProducts.forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.itemName} (${product.itemCode})`);
      console.log(`   Brand: ${product.brandId?.name || 'NULL'} (${product.brandId?._id || 'NULL'})`);
      console.log(`   Category: ${product.categoryId?.name || 'NULL'} (${product.categoryId?._id || 'NULL'})`);
      console.log(`   Subcategory: ${product.subcategoryId?.name || 'NULL'} (${product.subcategoryId?._id || 'NULL'})`);
      console.log(`   Extended: ${product.extendedSubcategoryId?.name || 'NULL'} (${product.extendedSubcategoryId?._id || 'NULL'})`);
    });

    // Now test the filtering logic
    console.log('\n🔍 FILTERING LOGIC TEST');
    
    const hierarchyFilters = [];

    // Filter by dealer's allowed brands
    if (dealer.allowedBrands && dealer.allowedBrands.length > 0) {
      const allowedBrandIds = dealer.allowedBrands.map(brand => 
        typeof brand === 'object' ? brand._id : brand
      );
      hierarchyFilters.push({ brandId: { $in: allowedBrandIds } });
      console.log('🔍 Brand filter:', allowedBrandIds.map(id => id.toString()));
    }

    // Filter by dealer's allowed categories
    if (dealer.allowedCategories && dealer.allowedCategories.length > 0) {
      const allowedCategoryIds = dealer.allowedCategories.map(cat => 
        typeof cat === 'object' ? cat._id : cat
      );
      hierarchyFilters.push({ categoryId: { $in: allowedCategoryIds } });
      console.log('🔍 Category filter:', allowedCategoryIds.map(id => id.toString()));
    }

    // Filter by dealer's allowed subcategories
    if (dealer.allowedSubcategories && dealer.allowedSubcategories.length > 0) {
      const allowedSubcategoryIds = dealer.allowedSubcategories.map(sub => 
        typeof sub === 'object' ? sub._id : sub
      );
      hierarchyFilters.push({ subcategoryId: { $in: allowedSubcategoryIds } });
      console.log('🔍 Subcategory filter:', allowedSubcategoryIds.map(id => id.toString()));
    }

    // Filter by dealer's allowed extended subcategories
    if (dealer.allowedExtendedSubcategories && dealer.allowedExtendedSubcategories.length > 0) {
      const allowedExtendedIds = dealer.allowedExtendedSubcategories.map(ext => 
        typeof ext === 'object' ? ext._id : ext
      );
      hierarchyFilters.push({ extendedSubcategoryId: { $in: allowedExtendedIds } });
      console.log('🔍 Extended filter:', allowedExtendedIds.map(id => id.toString()));
    }

    if (hierarchyFilters.length === 0) {
      console.log('❌ No hierarchy filters - dealer has no permissions');
      return;
    }

    // Test the actual filter
    const productFilter = {
      $or: hierarchyFilters,
      isActive: true
    };

    console.log('\n🔍 Final MongoDB filter:');
    console.log(JSON.stringify(productFilter, null, 2));

    // Execute the query
    const matchingProducts = await Product.find(productFilter)
      .populate('brandId', 'name')
      .populate('categoryId', 'name')
      .populate('subcategoryId', 'name')
      .populate('extendedSubcategoryId', 'name level')
      .select('itemName itemCode brandId categoryId subcategoryId extendedSubcategoryId');

    console.log(`\n📊 RESULTS: ${matchingProducts.length} products match the filter`);
    
    if (matchingProducts.length > 0) {
      console.log('\n✅ MATCHING PRODUCTS:');
      matchingProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.itemName} (${product.itemCode})`);
        console.log(`   Brand: ${product.brandId?.name || 'NULL'}`);
        console.log(`   Category: ${product.categoryId?.name || 'NULL'}`);
        console.log(`   Subcategory: ${product.subcategoryId?.name || 'NULL'}`);
        console.log(`   Extended: ${product.extendedSubcategoryId?.name || 'NULL'}`);
      });
    } else {
      console.log('\n❌ NO MATCHING PRODUCTS FOUND');
      console.log('\nPossible reasons:');
      console.log('1. Products don\'t have the required hierarchy fields set');
      console.log('2. Dealer permissions don\'t match any existing products');
      console.log('3. All products are inactive');
    }

    // Test individual filters
    console.log('\n🔍 TESTING INDIVIDUAL FILTERS:');
    
    for (let i = 0; i < hierarchyFilters.length; i++) {
      const filter = { ...hierarchyFilters[i], isActive: true };
      const count = await Product.countDocuments(filter);
      console.log(`Filter ${i + 1}: ${JSON.stringify(hierarchyFilters[i])} → ${count} products`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');
  }
};

debugProductDealerMatch();