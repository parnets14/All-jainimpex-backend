import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { calculateProductFilter, getAccessibleProductsSummary } from './utils/dealerProductPermissions.js';

// Import models
import Dealer from './models/Dealer.js';
import Product from './models/Product.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI;

async function testSmartHierarchicalPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Dealer = mongoose.model('Dealer');
    const Product = mongoose.model('Product');
    const Brand = mongoose.model('Brand');
    const Category = mongoose.model('Category');
    const Subcategory = mongoose.model('Subcategory');

    // Get some test data
    const brands = await Brand.find().limit(3);
    const categories = await Category.find().limit(5);
    const subcategories = await Subcategory.find().limit(5);

    console.log('📊 Test Data Available:');
    console.log(`  - Brands: ${brands.length}`);
    console.log(`  - Categories: ${categories.length}`);
    console.log(`  - Subcategories: ${subcategories.length}\n`);

    // TEST 1: Brand-only selection (should get ALL products from those brands)
    console.log('=' .repeat(60));
    console.log('TEST 1: Brand-Only Selection');
    console.log('=' .repeat(60));
    
    const mockDealer1 = {
      allowedBrands: brands.slice(0, 2).map(b => b._id),
      allowedCategories: [],
      allowedSubcategories: [],
      allowedExtendedSubcategories: []
    };

    console.log('Selected Brands:', brands.slice(0, 2).map(b => b.name));
    console.log('Selected Categories: NONE');
    console.log('Expected: ALL products from selected brands\n');

    const filter1 = await calculateProductFilter(mockDealer1);
    console.log('Generated Filter:', JSON.stringify(filter1, null, 2));
    
    const count1 = await Product.countDocuments(filter1);
    console.log(`✅ Accessible Products: ${count1}\n`);

    // TEST 2: Brand + Category selection (should get only those category products)
    console.log('=' .repeat(60));
    console.log('TEST 2: Brand + Category Selection');
    console.log('=' .repeat(60));
    
    const mockDealer2 = {
      allowedBrands: brands.slice(0, 2).map(b => b._id),
      allowedCategories: categories.slice(0, 2).map(c => c._id),
      allowedSubcategories: [],
      allowedExtendedSubcategories: []
    };

    console.log('Selected Brands:', brands.slice(0, 2).map(b => b.name));
    console.log('Selected Categories:', categories.slice(0, 2).map(c => c.name));
    console.log('Expected: Only products from selected categories\n');

    const filter2 = await calculateProductFilter(mockDealer2);
    console.log('Generated Filter:', JSON.stringify(filter2, null, 2));
    
    const count2 = await Product.countDocuments(filter2);
    console.log(`✅ Accessible Products: ${count2}\n`);

    // TEST 3: Mixed selection (Brand A with categories, Brand B without)
    console.log('=' .repeat(60));
    console.log('TEST 3: Mixed Selection');
    console.log('=' .repeat(60));
    
    const mockDealer3 = {
      allowedBrands: brands.slice(0, 2).map(b => b._id),
      allowedCategories: [categories[0]._id], // Only one category
      allowedSubcategories: [],
      allowedExtendedSubcategories: []
    };

    console.log('Selected Brands:', brands.slice(0, 2).map(b => b.name));
    console.log('Selected Categories:', [categories[0].name]);
    console.log('Expected: Smart per-brand filtering\n');

    const filter3 = await calculateProductFilter(mockDealer3);
    console.log('Generated Filter:', JSON.stringify(filter3, null, 2));
    
    const count3 = await Product.countDocuments(filter3);
    console.log(`✅ Accessible Products: ${count3}\n`);

    // TEST 4: No brand selection (should allow all products)
    console.log('=' .repeat(60));
    console.log('TEST 4: No Brand Selection');
    console.log('=' .repeat(60));
    
    const mockDealer4 = {
      allowedBrands: [],
      allowedCategories: [],
      allowedSubcategories: [],
      allowedExtendedSubcategories: []
    };

    console.log('Selected Brands: NONE');
    console.log('Expected: ALL products (no restrictions)\n');

    const filter4 = await calculateProductFilter(mockDealer4);
    console.log('Generated Filter:', JSON.stringify(filter4, null, 2));
    
    const count4 = await Product.countDocuments(filter4);
    console.log(`✅ Accessible Products: ${count4}\n`);

    // TEST 5: Test with real dealer
    console.log('=' .repeat(60));
    console.log('TEST 5: Real Dealer Test');
    console.log('=' .repeat(60));
    
    const realDealer = await Dealer.findOne()
      .populate('allowedBrands', '_id name')
      .populate('allowedCategories', '_id name')
      .populate('allowedSubcategories', '_id name')
      .populate('allowedExtendedSubcategories', '_id name level');

    if (realDealer) {
      console.log(`Testing with dealer: ${realDealer.name}`);
      console.log('Permissions:');
      console.log(`  - Brands: ${realDealer.allowedBrands?.length || 0}`);
      console.log(`  - Categories: ${realDealer.allowedCategories?.length || 0}`);
      console.log(`  - Subcategories: ${realDealer.allowedSubcategories?.length || 0}`);
      console.log(`  - Extended: ${realDealer.allowedExtendedSubcategories?.length || 0}\n`);

      const summary = await getAccessibleProductsSummary(realDealer);
      console.log('Summary:', summary.logic);
      console.log(`✅ Accessible Products: ${summary.totalProducts}\n`);
    } else {
      console.log('⚠️ No dealers found in database\n');
    }

    console.log('🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testSmartHierarchicalPermissions();
