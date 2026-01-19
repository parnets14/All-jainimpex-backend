import mongoose from 'mongoose';
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const testDealerAccessibleProducts = async () => {
  await connectDB();
  
  try {
    // Get a sample dealer
    const dealer = await Dealer.findOne()
      .populate('allowedBrands', '_id name')
      .populate('allowedCategories', '_id name')
      .populate('allowedSubcategories', '_id name')
      .populate('allowedExtendedSubcategories', '_id name level');
    
    if (!dealer) {
      console.log('❌ No dealers found in database');
      return;
    }
    
    console.log('🔍 Testing dealer:', dealer.name);
    console.log('📊 Dealer permissions:');
    console.log('  - Allowed Brands:', dealer.allowedBrands?.length || 0);
    console.log('  - Allowed Categories:', dealer.allowedCategories?.length || 0);
    console.log('  - Allowed Subcategories:', dealer.allowedSubcategories?.length || 0);
    console.log('  - Allowed Extended:', dealer.allowedExtendedSubcategories?.length || 0);
    
    // Build filter based on dealer's allowed hierarchy using AND logic
    // A product is accessible only if it matches ALL the dealer's hierarchy permissions
    const productFilter = {
      status: 'active' // Only show active products
    };

    // Filter by dealer's allowed brands (required)
    if (dealer.allowedBrands && dealer.allowedBrands.length > 0) {
      const allowedBrandIds = dealer.allowedBrands.map(brand => 
        typeof brand === 'object' ? brand._id : brand
      );
      productFilter.brand = { $in: allowedBrandIds };
      console.log('🔍 Brand filter (AND):', allowedBrandIds);
    } else {
      console.log('⚠️ No brands allowed - should return empty result');
      return;
    }
    
    // Filter by dealer's allowed categories (required)
    if (dealer.allowedCategories && dealer.allowedCategories.length > 0) {
      const allowedCategoryIds = dealer.allowedCategories.map(cat => 
        typeof cat === 'object' ? cat._id : cat
      );
      productFilter.category = { $in: allowedCategoryIds };
      console.log('🔍 Category filter (AND):', allowedCategoryIds);
    } else {
      console.log('⚠️ No categories allowed - should return empty result');
      return;
    }
    
    // Filter by dealer's allowed subcategories (required)
    if (dealer.allowedSubcategories && dealer.allowedSubcategories.length > 0) {
      const allowedSubcategoryIds = dealer.allowedSubcategories.map(sub => 
        typeof sub === 'object' ? sub._id : sub
      );
      productFilter.subcategory = { $in: allowedSubcategoryIds };
      console.log('🔍 Subcategory filter (AND):', allowedSubcategoryIds);
    } else {
      console.log('⚠️ No subcategories allowed - should return empty result');
      return;
    }
    
    // Filter by dealer's allowed extended subcategories (Level 1 only - required)
    if (dealer.allowedExtendedSubcategories && dealer.allowedExtendedSubcategories.length > 0) {
      const allowedExtendedIds = dealer.allowedExtendedSubcategories.map(ext => 
        typeof ext === 'object' ? ext._id : ext
      );
      // Only check subcategory1 (Level 1) - products must match this level exactly
      productFilter.subcategory1 = { $in: allowedExtendedIds };
      console.log('🔍 Extended subcategory Level 1 filter (AND):', allowedExtendedIds);
    } else {
      console.log('⚠️ No extended subcategories allowed - should return empty result');
      return;
    }
    
    console.log('🔍 Final product filter (AND logic):', JSON.stringify(productFilter, null, 2));
    
    // Get total count for pagination
    const total = await Product.countDocuments(productFilter);
    console.log('📊 Total accessible products:', total);
    
    // Get products with pagination
    const products = await Product.find(productFilter)
      .limit(10)
      .select('itemName productCode brand category subcategory subcategory1 subcategory2 subcategory3 subcategory4 subcategory5');
    
    console.log('📦 Sample accessible products:');
    products.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.itemName} (${product.productCode})`);
      console.log(`     Brand: ${product.brand?.toString() || 'N/A'}`);
      console.log(`     Category: ${product.category?.toString() || 'N/A'}`);
      console.log(`     Subcategory: ${product.subcategory?.toString() || 'N/A'}`);
      console.log(`     Extended: ${product.subcategory1?.toString() || 'N/A'}`);
    });
    
    // Also test with all products to compare
    const allProducts = await Product.find({ status: 'active' }).countDocuments();
    console.log('📊 Total products in database:', allProducts);
    console.log('📊 Filtering effectiveness:', `${total}/${allProducts} (${Math.round((total/allProducts)*100)}%)`);
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
  }
};

testDealerAccessibleProducts();