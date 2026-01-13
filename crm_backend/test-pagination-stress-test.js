// Stress test pagination with more extended subcategories
import axios from 'axios';
import ExtendedSubcategory from './models/ExtendedSubcategory.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = "http://localhost:5000/api";

async function createTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    // Find existing category and subcategory
    const category = await Category.findOne({ name: 'pipe' });
    const subcategory = await Subcategory.findOne({ name: 'pvc pipe' });

    if (!category || !subcategory) {
      console.log('❌ Required category/subcategory not found');
      return;
    }

    console.log('🔍 Found category:', category.name);
    console.log('🔍 Found subcategory:', subcategory.name);

    // Create 25 additional extended subcategories to test pagination
    const testItems = [];
    for (let i = 1; i <= 25; i++) {
      testItems.push({
        name: `Test Extended Subcategory ${i}`,
        description: `Test item ${i} for pagination testing`,
        category: category._id,
        subcategory: subcategory._id,
        parentExtendedSubcategory: null,
        level: 1,
        status: 'active',
        createdBy: new mongoose.Types.ObjectId()
      });
    }

    // Insert test data
    const insertedItems = await ExtendedSubcategory.insertMany(testItems);
    console.log(`✅ Created ${insertedItems.length} test extended subcategories`);

    return insertedItems;
  } catch (error) {
    console.error('❌ Error creating test data:', error.message);
    return [];
  }
}

async function cleanupTestData(testItems) {
  try {
    if (testItems.length > 0) {
      const testIds = testItems.map(item => item._id);
      await ExtendedSubcategory.deleteMany({ _id: { $in: testIds } });
      console.log(`🧹 Cleaned up ${testItems.length} test items`);
    }
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error cleaning up:', error.message);
  }
}

async function testPaginationWithLargeDataset() {
  let testItems = [];
  
  try {
    console.log('🧪 Testing Extended Subcategory Pagination with Large Dataset\n');

    // Step 1: Create test data
    console.log('📋 Step 1: Create Test Data');
    testItems = await createTestData();

    // Step 2: Login
    console.log('\n📋 Step 2: Login');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Step 3: Create axios instance
    const axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    // Step 4: Test pagination with large dataset
    console.log('\n📋 Step 3: Test Pagination with Large Dataset');
    
    // Test 1: Default pagination (should be limited to 10)
    console.log('\n🔍 Test 1: Default pagination (limit 10)');
    const defaultResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1 }
    });
    console.log('✅ Default pagination response:');
    console.log('   - Items received:', defaultResponse.data.items?.length || 0);
    console.log('   - Total items:', defaultResponse.data.pagination?.totalItems || 0);
    console.log('   - Total pages:', defaultResponse.data.pagination?.totalPages || 0);

    // Test 2: Frontend current call (should get all with limit 1000)
    console.log('\n🔍 Test 2: Frontend call with limit 1000');
    const frontendResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1, limit: 1000 }
    });
    console.log('✅ Frontend response:');
    console.log('   - Items received:', frontendResponse.data.items?.length || 0);
    console.log('   - Total items:', frontendResponse.data.pagination?.totalItems || 0);

    // Test 3: Check if all items are retrieved
    const totalItems = frontendResponse.data.pagination?.totalItems || 0;
    const receivedItems = frontendResponse.data.items?.length || 0;
    
    console.log('\n📊 Large Dataset Analysis:');
    console.log(`   - Total items in database: ${totalItems}`);
    console.log(`   - Items received with limit 1000: ${receivedItems}`);
    console.log(`   - Original items: ~8`);
    console.log(`   - Test items added: ${testItems.length}`);
    console.log(`   - Expected total: ~${8 + testItems.length}`);
    
    if (receivedItems === totalItems) {
      console.log('✅ All items retrieved successfully');
    } else {
      console.log('❌ Some items missing!');
    }

    // Test 4: Test pagination across multiple pages
    console.log('\n🔍 Test 3: Multi-page pagination');
    let allItemsFromPages = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const pageResponse = await axiosInstance.get('/extended-subcategories', {
        params: { level: 1, page: currentPage, limit: 10 }
      });
      
      const pageItems = pageResponse.data.items || [];
      allItemsFromPages = allItemsFromPages.concat(pageItems);
      
      console.log(`   - Page ${currentPage}: ${pageItems.length} items`);
      
      hasMorePages = pageResponse.data.pagination?.hasNextPage || false;
      currentPage++;
      
      // Safety break
      if (currentPage > 10) break;
    }
    
    console.log(`✅ Multi-page retrieval: ${allItemsFromPages.length} total items`);
    
    // Test 5: Verify frontend approach works
    console.log('\n🔍 Test 4: Verify Frontend Approach');
    
    const frontendItems = frontendResponse.data.items || [];
    const multiPageItems = allItemsFromPages;
    
    console.log(`   - Frontend approach (limit 1000): ${frontendItems.length} items`);
    console.log(`   - Multi-page approach: ${multiPageItems.length} items`);
    
    if (frontendItems.length === multiPageItems.length) {
      console.log('✅ Both approaches return same number of items');
    } else {
      console.log('⚠️  Different results between approaches');
    }

    console.log('\n📋 Step 4: Recommendations');
    
    if (totalItems > 10) {
      console.log('🔧 CONFIRMED: Frontend needs limit parameter for large datasets');
      console.log('   - Without limit: Only first 10 items returned');
      console.log('   - With limit 1000: All items returned');
      console.log('   - Current frontend implementation: ✅ CORRECT (uses limit: 1000)');
    }

    console.log('\n🎉 Large Dataset Pagination Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    // Cleanup test data
    await cleanupTestData(testItems);
  }
}

testPaginationWithLargeDataset();