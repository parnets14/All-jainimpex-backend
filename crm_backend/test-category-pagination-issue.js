// Test category pagination issue - 17 categories but only 9 showing
import axios from 'axios';

const API_BASE_URL = "http://localhost:5000/api";

async function testCategoryPagination() {
  try {
    console.log('🧪 Testing Category Pagination Issue\n');

    // Step 1: Login
    console.log('📋 Step 1: Login');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Step 2: Create axios instance
    const axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    // Step 3: Test different pagination scenarios for categories
    console.log('\n📋 Step 2: Test Category Pagination Scenarios');
    
    // Test 1: Default pagination (what frontend currently uses)
    console.log('\n🔍 Test 1: Default pagination (limit 9 - current frontend)');
    const defaultResponse = await axiosInstance.get('/categories', {
      params: { page: 1, limit: 9 }
    });
    console.log('✅ Default pagination response:');
    console.log('   - Categories received:', defaultResponse.data.categories?.length || 0);
    console.log('   - Total categories:', defaultResponse.data.pagination?.totalItems || 0);
    console.log('   - Total pages:', defaultResponse.data.pagination?.totalPages || 0);
    console.log('   - Current page:', defaultResponse.data.pagination?.currentPage || 0);

    // Test 2: Get all categories with large limit
    console.log('\n🔍 Test 2: Large limit (get all categories)');
    const allCategoriesResponse = await axiosInstance.get('/categories', {
      params: { limit: 100 }
    });
    console.log('✅ All categories response:');
    console.log('   - Categories received:', allCategoriesResponse.data.categories?.length || 0);
    console.log('   - Total categories:', allCategoriesResponse.data.pagination?.totalItems || 0);

    // Test 3: Check if we're missing categories
    const totalCategories = allCategoriesResponse.data.pagination?.totalItems || 0;
    const defaultCategories = defaultResponse.data.categories?.length || 0;
    
    console.log('\n📊 Category Pagination Analysis:');
    console.log(`   - Total categories in database: ${totalCategories}`);
    console.log(`   - Categories shown with limit 9: ${defaultCategories}`);
    console.log(`   - Missing categories: ${totalCategories - defaultCategories}`);
    
    if (totalCategories > defaultCategories) {
      console.log('❌ PROBLEM CONFIRMED: Frontend pagination is limiting results!');
      console.log(`   - User sees only ${defaultCategories} out of ${totalCategories} categories`);
      console.log('   - Need to fix frontend to show all categories');
    } else {
      console.log('✅ No pagination issues found');
    }

    // Test 4: List all categories for verification
    console.log('\n🔍 Test 3: List All Categories');
    const allCategories = allCategoriesResponse.data.categories || [];
    console.log(`✅ All ${allCategories.length} categories:`);
    allCategories.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name} (ID: ${category._id})`);
    });

    // Test 5: Test page 2 to see remaining categories
    if (totalCategories > 9) {
      console.log('\n🔍 Test 4: Page 2 categories (what user is missing)');
      const page2Response = await axiosInstance.get('/categories', {
        params: { page: 2, limit: 9 }
      });
      const page2Categories = page2Response.data.categories || [];
      console.log(`✅ Page 2 has ${page2Categories.length} categories:`);
      page2Categories.forEach((category, index) => {
        console.log(`   ${index + 1}. ${category.name} (ID: ${category._id})`);
      });
    }

    console.log('\n📋 Step 3: Recommendations');
    
    if (totalCategories > 9) {
      console.log('🔧 SOLUTION: Update CategoryMaster frontend to show all categories');
      console.log('   - Option 1: Increase limit to 100 in fetchCategories');
      console.log('   - Option 2: Add proper pagination controls');
      console.log('   - Option 3: Remove pagination for categories (show all)');
      console.log('   - RECOMMENDED: Option 1 (increase limit to 100)');
    }

    console.log('\n🎉 Category Pagination Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testCategoryPagination();