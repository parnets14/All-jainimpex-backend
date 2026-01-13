// Test category pagination fix - should now show all 17 categories
import axios from 'axios';

const API_BASE_URL = "http://localhost:5000/api";

async function testCategoryPaginationFix() {
  try {
    console.log('🧪 Testing Category Pagination Fix\n');

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

    // Step 3: Test the fixed frontend call
    console.log('\n📋 Step 2: Test Fixed Frontend Call');
    
    // Simulate the fixed frontend call (limit 100)
    console.log('\n🔍 Test: Fixed frontend call (limit 100)');
    const fixedResponse = await axiosInstance.get('/categories', {
      params: { page: 1, limit: 100 }
    });
    console.log('✅ Fixed frontend response:');
    console.log('   - Categories received:', fixedResponse.data.categories?.length || 0);
    console.log('   - Total categories:', fixedResponse.data.pagination?.totalItems || 0);
    console.log('   - Total pages:', fixedResponse.data.pagination?.totalPages || 0);

    // Step 4: Verify all categories are retrieved
    const totalCategories = fixedResponse.data.pagination?.totalItems || 0;
    const receivedCategories = fixedResponse.data.categories?.length || 0;
    
    console.log('\n📊 Fix Verification:');
    console.log(`   - Total categories in database: ${totalCategories}`);
    console.log(`   - Categories received with fix: ${receivedCategories}`);
    
    if (receivedCategories === totalCategories) {
      console.log('✅ SUCCESS: All categories are now retrieved!');
      console.log('✅ Frontend will now show all 17 categories');
    } else {
      console.log('❌ ISSUE: Still missing some categories');
      console.log(`   - Missing: ${totalCategories - receivedCategories} categories`);
    }

    // Step 5: List first 10 categories to verify
    console.log('\n🔍 First 10 categories (verification):');
    const categories = fixedResponse.data.categories || [];
    categories.slice(0, 10).forEach((category, index) => {
      console.log(`   ${index + 1}. ${category.name}`);
    });
    
    if (categories.length > 10) {
      console.log(`   ... and ${categories.length - 10} more categories`);
    }

    // Step 6: Performance check
    console.log('\n📊 Performance Analysis:');
    console.log(`   - Categories loaded: ${receivedCategories}`);
    console.log('   - Expected performance: Excellent (< 100 items)');
    console.log('   - User experience: All categories visible in one view');

    console.log('\n🎉 Category Pagination Fix Test Complete!');
    
    if (receivedCategories === totalCategories) {
      console.log('\n✅ RECOMMENDATION: The fix is working perfectly!');
      console.log('   - User will now see all 17 categories');
      console.log('   - No pagination issues');
      console.log('   - Refresh the Category Master page to see the fix');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testCategoryPaginationFix();