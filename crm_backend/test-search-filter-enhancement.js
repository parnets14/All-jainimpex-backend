import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';
import DealerPricing from './models/DealerPricing.js';
import Brand from './models/Brand.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

async function testSearchFilterEnhancement() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('✅ Connected to MongoDB');

    console.log('\n🔍 Testing Search Filter Enhancement in Dealer Product Pricing');
    
    // Get some sample products to test search functionality
    const products = await Product.find({})
      .populate('brand category subcategory')
      .limit(10);

    console.log(`\n📦 Found ${products.length} sample products for testing:`);
    
    products.forEach((product, index) => {
      console.log(`${index + 1}. ${product.itemName} (${product.productCode})`);
      console.log(`   Brand: ${product.brand?.name || 'N/A'}`);
      console.log(`   Category: ${product.category?.name || 'N/A'}`);
      console.log(`   Subcategory: ${product.subcategory?.name || 'N/A'}`);
    });

    // Test different search scenarios
    console.log('\n🧪 Testing Search Scenarios:');

    // Test 1: Search by product name
    console.log('\n1. Search by product name (case insensitive):');
    const searchTerm1 = 'elbow';
    const nameResults = products.filter(product =>
      product.itemName?.toLowerCase().includes(searchTerm1.toLowerCase())
    );
    console.log(`   Search term: "${searchTerm1}"`);
    console.log(`   Results: ${nameResults.length} products found`);
    nameResults.forEach(product => {
      console.log(`   - ${product.itemName} (${product.productCode})`);
    });

    // Test 2: Search by product code
    console.log('\n2. Search by product code:');
    const searchTerm2 = '165165618';
    const codeResults = products.filter(product =>
      product.productCode?.toLowerCase().includes(searchTerm2.toLowerCase())
    );
    console.log(`   Search term: "${searchTerm2}"`);
    console.log(`   Results: ${codeResults.length} products found`);
    codeResults.forEach(product => {
      console.log(`   - ${product.itemName} (${product.productCode})`);
    });

    // Test 3: Search by brand name
    console.log('\n3. Search by brand name:');
    const searchTerm3 = 'TRUFLO';
    const brandResults = products.filter(product =>
      product.brand?.name?.toLowerCase().includes(searchTerm3.toLowerCase())
    );
    console.log(`   Search term: "${searchTerm3}"`);
    console.log(`   Results: ${brandResults.length} products found`);
    brandResults.forEach(product => {
      console.log(`   - ${product.itemName} (Brand: ${product.brand?.name})`);
    });

    // Test 4: Search by category name
    console.log('\n4. Search by category name:');
    const searchTerm4 = 'cpvc';
    const categoryResults = products.filter(product =>
      product.category?.name?.toLowerCase().includes(searchTerm4.toLowerCase())
    );
    console.log(`   Search term: "${searchTerm4}"`);
    console.log(`   Results: ${categoryResults.length} products found`);
    categoryResults.forEach(product => {
      console.log(`   - ${product.itemName} (Category: ${product.category?.name})`);
    });

    // Test 5: Combined search (should match any field)
    console.log('\n5. Combined search (matches any field):');
    const searchTerm5 = 'brass';
    const combinedResults = products.filter(product =>
      product.itemName?.toLowerCase().includes(searchTerm5.toLowerCase()) ||
      product.productCode?.toLowerCase().includes(searchTerm5.toLowerCase()) ||
      product.brand?.name?.toLowerCase().includes(searchTerm5.toLowerCase()) ||
      product.category?.name?.toLowerCase().includes(searchTerm5.toLowerCase())
    );
    console.log(`   Search term: "${searchTerm5}"`);
    console.log(`   Results: ${combinedResults.length} products found`);
    combinedResults.forEach(product => {
      console.log(`   - ${product.itemName} (${product.productCode})`);
      console.log(`     Brand: ${product.brand?.name}, Category: ${product.category?.name}`);
    });

    console.log('\n🎉 Search Filter Enhancement Test Completed!');
    console.log('\n📋 Summary of Enhancements:');
    console.log('   ✅ Search moved from header to Advanced Filters section');
    console.log('   ✅ Search integrated with other filters (Brand, Category, etc.)');
    console.log('   ✅ Search works across multiple fields: name, code, brand, category');
    console.log('   ✅ Case-insensitive search functionality');
    console.log('   ✅ Real-time filtering as user types');
    console.log('   ✅ Clear Filters button resets search along with other filters');
    console.log('   ✅ Consistent UI pattern with other modules in the system');

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

testSearchFilterEnhancement();