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

const testSpecificDealer = async () => {
  await connectDB();
  
  try {
    // Get Ravi Ranjan Rai dealer specifically
    const dealer = await Dealer.findOne({ name: 'Ravi Ranjan Rai' })
      .populate('allowedBrands', '_id name')
      .populate('allowedCategories', '_id name')
      .populate('allowedSubcategories', '_id name')
      .populate('allowedExtendedSubcategories', '_id name level');
    
    if (!dealer) {
      console.log('❌ Ravi Ranjan Rai dealer not found');
      return;
    }
    
    console.log('🔍 Testing dealer:', dealer.name);
    console.log('📊 Dealer permissions:');
    console.log('  - Allowed Brands:', dealer.allowedBrands?.length || 0);
    console.log('  - Allowed Categories:', dealer.allowedCategories?.length || 0);
    console.log('  - Allowed Subcategories:', dealer.allowedSubcategories?.length || 0);
    console.log('  - Allowed Extended:', dealer.allowedExtendedSubcategories?.length || 0);
    
    // Show the actual hierarchy values
    console.log('\n🔍 Dealer hierarchy details:');
    if (dealer.allowedBrands?.length > 0) {
      dealer.allowedBrands.forEach(brand => {
        console.log(`  Brand: ${brand.name} (${brand._id})`);
      });
    }
    if (dealer.allowedCategories?.length > 0) {
      dealer.allowedCategories.forEach(cat => {
        console.log(`  Category: ${cat.name} (${cat._id})`);
      });
    }
    if (dealer.allowedSubcategories?.length > 0) {
      dealer.allowedSubcategories.forEach(sub => {
        console.log(`  Subcategory: ${sub.name} (${sub._id})`);
      });
    }
    if (dealer.allowedExtendedSubcategories?.length > 0) {
      dealer.allowedExtendedSubcategories.forEach(ext => {
        console.log(`  Extended Level ${ext.level}: ${ext.name} (${ext._id})`);
      });
    }
    
    // Build filter using AND logic
    const productFilter = {
      status: 'active'
    };

    if (dealer.allowedBrands && dealer.allowedBrands.length > 0) {
      const allowedBrandIds = dealer.allowedBrands.map(brand => brand._id);
      productFilter.brand = { $in: allowedBrandIds };
    }
    
    if (dealer.allowedCategories && dealer.allowedCategories.length > 0) {
      const allowedCategoryIds = dealer.allowedCategories.map(cat => cat._id);
      productFilter.category = { $in: allowedCategoryIds };
    }
    
    if (dealer.allowedSubcategories && dealer.allowedSubcategories.length > 0) {
      const allowedSubcategoryIds = dealer.allowedSubcategories.map(sub => sub._id);
      productFilter.subcategory = { $in: allowedSubcategoryIds };
    }
    
    if (dealer.allowedExtendedSubcategories && dealer.allowedExtendedSubcategories.length > 0) {
      const allowedExtendedIds = dealer.allowedExtendedSubcategories.map(ext => ext._id);
      productFilter.subcategory1 = { $in: allowedExtendedIds };
    }
    
    console.log('\n🔍 Final product filter (AND logic):', JSON.stringify(productFilter, null, 2));
    
    // Get total count
    const total = await Product.countDocuments(productFilter);
    console.log('\n📊 Total accessible products:', total);
    
    // Get products
    const products = await Product.find(productFilter)
      .limit(10)
      .select('itemName productCode brand category subcategory subcategory1');
    
    console.log('\n📦 Accessible products:');
    if (products.length === 0) {
      console.log('  ❌ No products match ALL hierarchy criteria');
      
      // Let's check what products exist for each individual criteria
      console.log('\n🔍 Debugging - checking individual criteria:');
      
      // Check products by brand only
      const brandProducts = await Product.find({ 
        brand: productFilter.brand,
        status: 'active'
      }).countDocuments();
      console.log(`  Products with matching brand: ${brandProducts}`);
      
      // Check products by category only  
      const categoryProducts = await Product.find({ 
        category: productFilter.category,
        status: 'active'
      }).countDocuments();
      console.log(`  Products with matching category: ${categoryProducts}`);
      
      // Check products by subcategory only
      const subcategoryProducts = await Product.find({ 
        subcategory: productFilter.subcategory,
        status: 'active'
      }).countDocuments();
      console.log(`  Products with matching subcategory: ${subcategoryProducts}`);
      
      // Check products by extended subcategory only
      const extendedProducts = await Product.find({ 
        subcategory1: productFilter.subcategory1,
        status: 'active'
      }).countDocuments();
      console.log(`  Products with matching extended level 1: ${extendedProducts}`);
      
    } else {
      products.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.itemName} (${product.productCode})`);
        console.log(`     Brand: ${product.brand?.toString()}`);
        console.log(`     Category: ${product.category?.toString()}`);
        console.log(`     Subcategory: ${product.subcategory?.toString()}`);
        console.log(`     Extended L1: ${product.subcategory1?.toString()}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');
  }
};

testSpecificDealer();