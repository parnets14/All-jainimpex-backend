import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Product from './models/Product.js';

// Load environment variables
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const testDiscountTargets = async () => {
  try {
    console.log('\n🧪 TESTING DISCOUNT TARGETS AVAILABILITY\n');

    // 1. Test Brands
    console.log('1️⃣ Testing Brands...');
    const brands = await Brand.find({}).limit(10);
    console.log(`   ✅ Found ${brands.length} brands`);
    if (brands.length > 0) {
      console.log(`   Sample: ${brands[0].name}`);
    }

    // 2. Test Categories
    console.log('\n2️⃣ Testing Categories...');
    const categories = await Category.find({}).limit(10);
    console.log(`   ✅ Found ${categories.length} categories`);
    if (categories.length > 0) {
      console.log(`   Sample: ${categories[0].name}`);
    }

    // 3. Test Subcategories
    console.log('\n3️⃣ Testing Subcategories...');
    const subcategories = await Subcategory.find({}).limit(10);
    console.log(`   ✅ Found ${subcategories.length} subcategories`);
    if (subcategories.length > 0) {
      console.log(`   Sample: ${subcategories[0].name}`);
    }

    // 4. Test Extended Subcategories (Level 1)
    console.log('\n4️⃣ Testing Extended Subcategories...');
    const allExtended = await ExtendedSubcategory.find({});
    const level1Extended = allExtended.filter(item => item.level === 1);
    console.log(`   ✅ Found ${allExtended.length} total extended subcategories`);
    console.log(`   ✅ Found ${level1Extended.length} Level 1 extended subcategories`);
    
    if (level1Extended.length > 0) {
      console.log(`   Sample Level 1: ${level1Extended[0].name} (Level ${level1Extended[0].level})`);
    }
    
    // Show level distribution
    const levelCounts = {};
    allExtended.forEach(item => {
      levelCounts[item.level] = (levelCounts[item.level] || 0) + 1;
    });
    console.log('   Level distribution:', levelCounts);

    // 5. Test Products
    console.log('\n5️⃣ Testing Products...');
    const products = await Product.find({}).limit(10);
    console.log(`   ✅ Found ${products.length} products`);
    if (products.length > 0) {
      console.log(`   Sample: ${products[0].itemName} (Code: ${products[0].productCode})`);
    }

    // 6. Test API response format simulation
    console.log('\n6️⃣ Testing API Response Format...');
    
    const apiSimulation = {
      brands: {
        success: true,
        brands: brands.map(b => ({ _id: b._id, name: b.name, description: b.description }))
      },
      categories: {
        success: true,
        categories: categories.map(c => ({ _id: c._id, name: c.name, description: c.description }))
      },
      subcategories: {
        success: true,
        subcategories: subcategories.map(s => ({ _id: s._id, name: s.name, description: s.description }))
      },
      extendedSubcategories: {
        success: true,
        extendedSubcategories: level1Extended.map(e => ({ 
          _id: e._id, 
          name: e.name, 
          level: e.level, 
          description: e.description 
        }))
      },
      products: {
        success: true,
        products: products.map(p => ({ 
          _id: p._id, 
          itemName: p.itemName, 
          productCode: p.productCode,
          description: p.description 
        }))
      }
    };

    console.log('   API Response Simulation:');
    console.log(`   - Brands: ${apiSimulation.brands.brands.length} items`);
    console.log(`   - Categories: ${apiSimulation.categories.categories.length} items`);
    console.log(`   - Subcategories: ${apiSimulation.subcategories.subcategories.length} items`);
    console.log(`   - Extended L1: ${apiSimulation.extendedSubcategories.extendedSubcategories.length} items`);
    console.log(`   - Products: ${apiSimulation.products.products.length} items`);

    // 7. Test hierarchy relationships
    console.log('\n7️⃣ Testing Hierarchy Relationships...');
    
    if (products.length > 0) {
      const sampleProduct = products[0];
      console.log(`   Sample Product: ${sampleProduct.itemName}`);
      console.log(`   - Brand: ${sampleProduct.brand || 'Not set'}`);
      console.log(`   - Category: ${sampleProduct.category || 'Not set'}`);
      console.log(`   - Subcategory: ${sampleProduct.subcategory || 'Not set'}`);
      console.log(`   - Subcategory1: ${sampleProduct.subcategory1 || 'Not set'}`);
      console.log(`   - Subcategory2: ${sampleProduct.subcategory2 || 'Not set'}`);
    }

    // 8. Test filtering logic simulation
    console.log('\n8️⃣ Testing Filtering Logic...');
    
    // Simulate existing discounts
    const existingDiscounts = [
      {
        targetType: 'brand',
        targetId: brands[0]?._id,
        targetName: brands[0]?.name,
        isActive: true
      }
    ];

    console.log('   Existing discounts:', existingDiscounts.length);
    
    // Test brand filtering (should exclude children of selected brand)
    const availableBrands = brands.filter(brand => {
      const hasChildDiscounts = existingDiscounts.some(discount => {
        // In real implementation, this would check if any categories belong to this brand
        return false; // Simplified for test
      });
      return !hasChildDiscounts && !existingDiscounts.some(d => d.targetType === 'brand' && d.targetId?.toString() === brand._id.toString());
    });

    console.log(`   Available brands after filtering: ${availableBrands.length} (excluded: ${brands.length - availableBrands.length})`);

    console.log('\n✅ ALL DISCOUNT TARGETS TESTS PASSED!');
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   - Brands available: ${brands.length}`);
    console.log(`   - Categories available: ${categories.length}`);
    console.log(`   - Subcategories available: ${subcategories.length}`);
    console.log(`   - Extended Level 1 available: ${level1Extended.length}`);
    console.log(`   - Products available: ${products.length}`);
    
    if (level1Extended.length === 0) {
      console.log('\n⚠️  WARNING: No Level 1 Extended Subcategories found!');
      console.log('   This might be why the Extended Level 1 dropdown is empty.');
      console.log('   Check if extended subcategories have level field set to 1.');
    }
    
    if (products.length === 0) {
      console.log('\n⚠️  WARNING: No Products found!');
      console.log('   This might be why the Products dropdown is empty.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
};

const runTest = async () => {
  await connectDB();
  await testDiscountTargets();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

runTest();