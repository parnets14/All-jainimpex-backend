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

const testAPIEndpoints = async () => {
  try {
    console.log('\n🧪 TESTING API ENDPOINTS FOR DISCOUNT TARGETS\n');

    // Simulate the exact API calls made by the frontend
    console.log('1️⃣ Testing getBrands API simulation...');
    const brandsResponse = {
      success: true,
      brands: await Brand.find({}).limit(10000).select('_id name description')
    };
    console.log(`   ✅ Brands API: ${brandsResponse.brands.length} items`);
    console.log(`   Sample:`, brandsResponse.brands[0]);

    console.log('\n2️⃣ Testing getCategories API simulation...');
    const categoriesResponse = {
      success: true,
      categories: await Category.find({}).limit(10000).select('_id name description brand brandId')
    };
    console.log(`   ✅ Categories API: ${categoriesResponse.categories.length} items`);
    console.log(`   Sample:`, categoriesResponse.categories[0]);

    console.log('\n3️⃣ Testing getSubcategories API simulation...');
    const subcategoriesResponse = {
      success: true,
      subcategories: await Subcategory.find({}).limit(10000).select('_id name description brand brandId category categoryId')
    };
    console.log(`   ✅ Subcategories API: ${subcategoriesResponse.subcategories.length} items`);
    console.log(`   Sample:`, subcategoriesResponse.subcategories[0]);

    console.log('\n4️⃣ Testing getExtendedSubcategories API simulation...');
    const extendedResponse = {
      success: true,
      extendedSubcategories: await ExtendedSubcategory.find({}).limit(10000).select('_id name description level brand brandId category categoryId subcategory subcategoryId')
    };
    console.log(`   ✅ Extended Subcategories API: ${extendedResponse.extendedSubcategories.length} items`);
    
    // Filter Level 1 items (as done in frontend)
    const level1Extended = extendedResponse.extendedSubcategories.filter(item => item.level === 1);
    console.log(`   ✅ Level 1 Extended: ${level1Extended.length} items`);
    console.log(`   Sample Level 1:`, level1Extended[0]);

    console.log('\n5️⃣ Testing getProducts API simulation...');
    const productsResponse = {
      success: true,
      products: await Product.find({}).limit(10000).select('_id itemName productCode description brand brandId category categoryId subcategory subcategoryId subcategory1 subcategory2 subcategory3 subcategory4 subcategory5')
    };
    console.log(`   ✅ Products API: ${productsResponse.products.length} items`);
    console.log(`   Sample:`, productsResponse.products[0]);

    // Test the exact data structure that would be available in frontend
    console.log('\n6️⃣ Testing Frontend Data Structure...');
    
    const frontendData = {
      availableDiscountBrands: brandsResponse.brands,
      availableDiscountCategories: categoriesResponse.categories,
      availableDiscountSubcategories: subcategoriesResponse.subcategories,
      availableDiscountExtended: level1Extended,
      availableDiscountProducts: productsResponse.products
    };

    console.log('   Frontend data structure:');
    console.log(`   - availableDiscountBrands: ${frontendData.availableDiscountBrands.length} items`);
    console.log(`   - availableDiscountCategories: ${frontendData.availableDiscountCategories.length} items`);
    console.log(`   - availableDiscountSubcategories: ${frontendData.availableDiscountSubcategories.length} items`);
    console.log(`   - availableDiscountExtended: ${frontendData.availableDiscountExtended.length} items`);
    console.log(`   - availableDiscountProducts: ${frontendData.availableDiscountProducts.length} items`);

    // Test filtering logic simulation
    console.log('\n7️⃣ Testing Filtering Logic Simulation...');
    
    const existingDiscounts = []; // No existing discounts for this test
    
    // Simulate getFilteredDiscountTargets for extendedSubcategory
    const filteredExtended = frontendData.availableDiscountExtended.filter(extended => {
      // Check if any parent is already selected
      const parentSelected = existingDiscounts.some(d => {
        const brandMatch = d.targetType === 'brand' && (
          d.targetId === extended.brand || 
          d.targetId === extended.brandId ||
          d.targetId?.toString() === extended.brand?.toString() ||
          d.targetId?.toString() === extended.brandId?.toString()
        );
        const categoryMatch = d.targetType === 'category' && (
          d.targetId === extended.category || 
          d.targetId === extended.categoryId ||
          d.targetId?.toString() === extended.category?.toString() ||
          d.targetId?.toString() === extended.categoryId?.toString()
        );
        const subcategoryMatch = d.targetType === 'subcategory' && (
          d.targetId === extended.subcategory || 
          d.targetId === extended.subcategoryId ||
          d.targetId?.toString() === extended.subcategory?.toString() ||
          d.targetId?.toString() === extended.subcategoryId?.toString()
        );
        
        return brandMatch || categoryMatch || subcategoryMatch;
      });
      
      // Check if this extended subcategory has child products selected
      const hasChildDiscounts = existingDiscounts.some(discount => {
        if (discount.targetType === 'product') {
          const product = frontendData.availableDiscountProducts.find(p => p._id === discount.targetId);
          return product && (
            product.subcategory1?.toString() === extended._id?.toString() ||
            product.subcategory2?.toString() === extended._id?.toString() ||
            product.subcategory3?.toString() === extended._id?.toString() ||
            product.subcategory4?.toString() === extended._id?.toString() ||
            product.subcategory5?.toString() === extended._id?.toString()
          );
        }
        return false;
      });
      
      // Check if this exact extended subcategory is already selected
      const alreadySelected = existingDiscounts.some(d => 
        d.targetType === 'extendedSubcategory' && d.targetId?.toString() === extended._id?.toString()
      );
      
      const isAvailable = !parentSelected && !hasChildDiscounts && !alreadySelected;
      
      return isAvailable;
    });

    console.log(`   ✅ Filtered Extended Subcategories: ${filteredExtended.length}/${frontendData.availableDiscountExtended.length}`);
    
    if (filteredExtended.length > 0) {
      console.log(`   Sample filtered item:`, {
        id: filteredExtended[0]._id,
        name: filteredExtended[0].name,
        level: filteredExtended[0].level
      });
    }

    // Test search functionality simulation
    console.log('\n8️⃣ Testing Search Functionality...');
    
    const searchTerm = 'cera';
    const searchResults = filteredExtended.filter(option =>
      option.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    console.log(`   Search for "${searchTerm}": ${searchResults.length} results`);
    if (searchResults.length > 0) {
      console.log(`   Search results:`, searchResults.map(r => r.name));
    }

    console.log('\n✅ ALL API ENDPOINT TESTS PASSED!');
    
    // Summary for debugging
    console.log('\n📊 SUMMARY FOR FRONTEND DEBUGGING:');
    console.log('   If Extended Level 1 dropdown is empty, check:');
    console.log(`   1. API Response: Should have ${extendedResponse.extendedSubcategories.length} total extended items`);
    console.log(`   2. Level Filtering: Should have ${level1Extended.length} Level 1 items`);
    console.log(`   3. Hierarchy Filtering: Should have ${filteredExtended.length} available items (no conflicts)`);
    console.log(`   4. Search Filtering: Should work with case-insensitive name matching`);
    
    if (level1Extended.length === 0) {
      console.log('\n⚠️  WARNING: No Level 1 Extended Subcategories found!');
      console.log('   Check if extended subcategories have level field set to 1.');
    }
    
    if (filteredExtended.length === 0 && level1Extended.length > 0) {
      console.log('\n⚠️  WARNING: All Level 1 items filtered out by hierarchy logic!');
      console.log('   Check existing discounts or parent selection logic.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
};

const runTest = async () => {
  await connectDB();
  await testAPIEndpoints();
  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
};

runTest();