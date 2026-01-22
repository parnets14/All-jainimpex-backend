import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config({ path: './.env' });

const checkFilterData = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    // Check brands
    console.log('\n📊 Checking Brands...');
    const allBrands = await Brand.find({}).select('name isActive');
    console.log(`Total brands: ${allBrands.length}`);
    console.log('Sample brands:', allBrands.slice(0, 5));
    
    const activeBrands = await Brand.find({ isActive: true }).select('name');
    console.log(`Active brands: ${activeBrands.length}`);

    // Check categories
    console.log('\n📊 Checking Categories...');
    const allCategories = await Category.find({}).select('name isActive');
    console.log(`Total categories: ${allCategories.length}`);
    console.log('Sample categories:', allCategories.slice(0, 5));
    
    const activeCategories = await Category.find({ isActive: true }).select('name');
    console.log(`Active categories: ${activeCategories.length}`);

    // Check subcategories
    console.log('\n📊 Checking Subcategories...');
    const allSubcategories = await Subcategory.find({}).select('name isActive');
    console.log(`Total subcategories: ${allSubcategories.length}`);
    console.log('Sample subcategories:', allSubcategories.slice(0, 5));
    
    const activeSubcategories = await Subcategory.find({ isActive: true }).select('name');
    console.log(`Active subcategories: ${activeSubcategories.length}`);

    // Check products with hierarchy
    console.log('\n📊 Checking Products with hierarchy...');
    const productsWithBrand = await Product.find({ brand: { $exists: true, $ne: null } })
      .populate('brand', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .limit(5);
    
    console.log('Products with brand data:');
    productsWithBrand.forEach(product => {
      console.log(`- ${product.itemName}: Brand: ${product.brand?.name}, Category: ${product.category?.name}, Subcategory: ${product.subcategory?.name}`);
    });

    // Try alternative approach - get unique values from products
    console.log('\n📊 Getting unique hierarchy from products...');
    const uniqueBrands = await Product.distinct('brand');
    const uniqueCategories = await Product.distinct('category');
    const uniqueSubcategories = await Product.distinct('subcategory');
    
    console.log(`Unique brands in products: ${uniqueBrands.length}`);
    console.log(`Unique categories in products: ${uniqueCategories.length}`);
    console.log(`Unique subcategories in products: ${uniqueSubcategories.length}`);

    // Get actual brand/category/subcategory documents from product references
    if (uniqueBrands.length > 0) {
      const brandsFromProducts = await Brand.find({ _id: { $in: uniqueBrands } }).select('name');
      console.log('Brands from products:', brandsFromProducts.map(b => b.name));
    }

    if (uniqueCategories.length > 0) {
      const categoriesFromProducts = await Category.find({ _id: { $in: uniqueCategories } }).select('name');
      console.log('Categories from products:', categoriesFromProducts.map(c => c.name));
    }

    if (uniqueSubcategories.length > 0) {
      const subcategoriesFromProducts = await Subcategory.find({ _id: { $in: uniqueSubcategories } }).select('name');
      console.log('Subcategories from products:', subcategoriesFromProducts.map(s => s.name));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
  }
};

checkFilterData();