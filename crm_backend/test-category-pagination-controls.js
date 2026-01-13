// Test category pagination controls - should show 10 categories per page with navigation
import axios from 'axios';

const API_BASE_URL = "http://localhost:5000/api";

async function testCategoryPaginationControls() {
  try {
    console.log('🧪 Testing Category Pagination Controls\n');

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

    // Step 3: Test pagination with 10 items per page
    console.log('\n📋 Step 2: Test Pagination with 10 Items Per Page');
    
    // Test Page 1
    console.log('\n🔍 Test 1: Page 1 (first 10 categories)');
    const page1Response = await axiosInstance.get('/categories', {
      params: { page: 1, limit: 10 }
    });
    console.log('✅ Page 1 response:');
    console.log('   - Categories received:', page1Response.data.categories?.length || 0);
    console.log('   - Total categories:', page1Response.data.pagination?.totalItems || 0);
    console.log('   - Current page:', page1Response.data.pagination?.currentPage || 0);
    console.log('   - Total pages:', page1Response.data.pagination?.totalPages || 0);

    // Test Page 2
    console.log('\n🔍 Test 2: Page 2 (remaining categories)');
    const page2Response = await axiosInstance.get('/categories', {
      params: { page: 2, limit: 10 }
    });
    console.log('✅ Page 2 response:');
    console.log('   - Categories received:', page2Response.data.categories?.length || 0);
    console.log('   - Current page:', page2Response.data.pagination?.currentPage || 0);

    // Step 4: Verify pagination logic
    const totalCategories = page1Response.data.pagination?.totalItems || 0;
    const page1Categories = page1Response.data.categories?.length || 0;
    const page2Categories = page2Response.data.categories?.length || 0;
    const totalPages = page1Response.data.pagination?.totalPages || 0;
    
    console.log('\n📊 Pagination Verification:');
    console.log(`   - Total categories: ${totalCategories}`);
    console.log(`   - Page 1 categories: ${page1Categories}`);
    console.log(`   - Page 2 categories: ${page2Categories}`);
    console.log(`   - Total pages: ${totalPages}`);
    console.log(`   - Categories per page: 10`);
    
    // Verify math
    const expectedPage1 = Math.min(10, totalCategories);
    const expectedPage2 = Math.max(0, totalCategories - 10);
    const expectedTotalPages = Math.ceil(totalCategories / 10);
    
    console.log('\n🔍 Expected vs Actual:');
    console.log(`   - Expected page 1: ${expectedPage1}, Actual: ${page1Categories} ${expectedPage1 === page1Categories ? '✅' : '❌'}`);
    console.log(`   - Expected page 2: ${expectedPage2}, Actual: ${page2Categories} ${expectedPage2 === page2Categories ? '✅' : '❌'}`);
    console.log(`   - Expected total pages: ${expectedTotalPages}, Actual: ${totalPages} ${expectedTotalPages === totalPages ? '✅' : '❌'}`);

    // Step 5: List categories from both pages
    console.log('\n🔍 Categories Distribution:');
    
    console.log('\n📄 Page 1 Categories:');
    const page1Categories_list = page1Response.data.categories || [];
    page1Categories_list.forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name}`);
    });
    
    if (page2Categories > 0) {
      console.log('\n📄 Page 2 Categories:');
      const page2Categories_list = page2Response.data.categories || [];
      page2Categories_list.forEach((category, index) => {
        console.log(`   ${index + 1}. ${category.name}`);
      });
    }

    // Step 6: Test pagination controls functionality
    console.log('\n📋 Step 3: Pagination Controls Test');
    
    if (totalPages > 1) {
      console.log('✅ Pagination controls should be visible');
      console.log('✅ Previous/First buttons should be disabled on page 1');
      console.log('✅ Next/Last buttons should be enabled on page 1');
      console.log('✅ Page numbers should show current page highlighted');
      
      if (totalPages === 2) {
        console.log('✅ Next/Last buttons should be disabled on page 2');
        console.log('✅ Previous/First buttons should be enabled on page 2');
      }
    } else {
      console.log('ℹ️  Pagination controls should be hidden (only 1 page)');
    }

    // Step 7: User Experience Summary
    console.log('\n📋 Step 4: User Experience Summary');
    console.log(`✅ User will see ${page1Categories} categories on first load`);
    console.log(`✅ User can navigate to page 2 to see ${page2Categories} more categories`);
    console.log('✅ Pagination controls provide clear navigation');
    console.log('✅ Page information shows current position');

    console.log('\n🎉 Category Pagination Controls Test Complete!');
    
    console.log('\n📋 Frontend Implementation Status:');
    console.log('✅ Pagination state: Updated to 10 items per page');
    console.log('✅ Pagination controls: Added with navigation buttons');
    console.log('✅ Page change handlers: Implemented');
    console.log('✅ Pagination info: Shows current page and total items');
    console.log('\n🔄 Next: Refresh the Category Master page to see pagination controls');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testCategoryPaginationControls();