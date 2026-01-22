import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import Product from './models/Product.js';

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

const checkTestHierarchy = async () => {
  try {
    await connectDB();
    
    console.log('\n' + '='.repeat(60));
    console.log('🔍 CHECKING TEST HIERARCHY STRUCTURE');
    console.log('='.repeat(60));
    
    // 1. Find all brands with "test" in name
    console.log('\n🏢 Step 1: Finding Test Brands...');
    const testBrands = await Brand.find({ name: { $regex: /test/i } });
    console.log(`Found ${testBrands.length} test brands:`);
    testBrands.forEach(brand => {
      console.log(`  - ${brand.name} (${brand._id})`);
    });
    
    if (testBrands.length === 0) {
      console.log('❌ No test brands found');
      return;
    }
    
    const testBrand = testBrands[0];
    console.log(`\n🎯 Using brand: ${testBrand.name}`);
    
    // 2. Find all categories for this brand
    console.log('\n📁 Step 2: Finding Categories for Test Brand...');
    const categories = await Category.find({ brandId: testBrand._id });
    console.log(`Found ${categories.length} categories for ${testBrand.name}:`);
    categories.forEach(category => {
      console.log(`  - ${category.name} (${category._id})`);
    });
    
    if (categories.length === 0) {
      console.log('❌ No categories found for test brand');
      return;
    }
    
    // 3. For each category, find subcategories
    for (const category of categories) {
      console.log(`\n📂 Step 3: Finding Subcategories for ${category.name}...`);
      const subcategories = await Subcategory.find({ 
        brandId: testBrand._id,
        categoryId: category._id 
      });
      console.log(`Found ${subcategories.length} subcategories:`);
      subcategories.forEach(subcategory => {
        console.log(`  - ${subcategory.name} (${subcategory._id})`);
      });
      
      // 4. For each subcategory, find products
      for (const subcategory of subcategories) {
        console.log(`\n📦 Step 4: Finding Products for ${testBrand.name} → ${category.name} → ${subcategory.name}...`);
        const products = await Product.find({
          brand: testBrand._id,
          category: category._id,
          subcategory: subcategory._id
        }).select('productCode itemName subcategory1 subcategory2 subcategory3');
        
        console.log(`Found ${products.length} products:`);
        products.forEach(product => {
          const hasExtended = product.subcategory1 || product.subcategory2 || product.subcategory3;
          console.log(`  - ${product.productCode} - ${product.itemName} ${hasExtended ? '(HAS EXTENDED)' : '(BASIC ONLY)'}`);
          if (hasExtended) {
            console.log(`    Extended: L1=${product.subcategory1 || 'null'}, L2=${product.subcategory2 || 'null'}, L3=${product.subcategory3 || 'null'}`);
          }
        });
        
        if (products.length > 0) {
          console.log(`\n🎯 FOUND HIERARCHY: ${testBrand.name} → ${category.name} → ${subcategory.name}`);
          console.log(`   Brand ID: ${testBrand._id}`);
          console.log(`   Category ID: ${category._id}`);
          console.log(`   Subcategory ID: ${subcategory._id}`);
          console.log(`   Products: ${products.length}`);
          
          const basicProducts = products.filter(p => !p.subcategory1 && !p.subcategory2 && !p.subcategory3);
          const extendedProducts = products.filter(p => p.subcategory1 || p.subcategory2 || p.subcategory3);
          
          console.log(`   - Basic products (no extended levels): ${basicProducts.length}`);
          console.log(`   - Extended products: ${extendedProducts.length}`);
          
          if (basicProducts.length > 0) {
            console.log('\n✅ PERFECT! This hierarchy has basic products that should be accessible to dealers with basic permissions.');
            break;
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 HIERARCHY CHECK COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error in check:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

checkTestHierarchy();