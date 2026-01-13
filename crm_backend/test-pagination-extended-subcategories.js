// Test pagination for extended subcategories to ensure we get all items
import axios from 'axios';

const API_BASE_URL = "http://localhost:5000/api";

async function testExtendedSubcategoryPagination() {
  try {
    console.log('🧪 Testing Extended Subcategory Pagination\n');

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

    // Step 3: Test different pagination scenarios
    console.log('\n📋 Step 2: Test Different Pagination Scenarios');
    
    // Test 1: Default pagination (usually 10 items)
    console.log('\n🔍 Test 1: Default pagination');
    const defaultResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1 }
    });
    console.log('✅ Default pagination response:');
    console.log('   - Items:', defaultResponse.data.items?.length || 0);
    console.log('   - Pagination:', defaultResponse.data.pagination);

    // Test 2: Small limit (5 items)
    console.log('\n🔍 Test 2: Small limit (5 items)');
    const smallLimitResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1, limit: 5 }
    });
    console.log('✅ Small limit response:');
    console.log('   - Items:', smallLimitResponse.data.items?.length || 0);
    console.log('   - Pagination:', smallLimitResponse.data.pagination);

    // Test 3: Large limit (1000 items)
    console.log('\n🔍 Test 3: Large limit (1000 items)');
    const largeLimitResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1, limit: 1000 }
    });
    console.log('✅ Large limit response:');
    console.log('   - Items:', largeLimitResponse.data.items?.length || 0);
    console.log('   - Pagination:', largeLimitResponse.data.pagination);

    // Test 4: Check if we're missing items with default pagination
    const totalItems = largeLimitResponse.data.pagination?.totalItems || 0;
    const defaultItems = defaultResponse.data.items?.length || 0;
    
    console.log('\n📊 Pagination Analysis:');
    console.log(`   - Total items in database: ${totalItems}`);
    console.log(`   - Items with default pagination: ${defaultItems}`);
    console.log(`   - Items with large limit: ${largeLimitResponse.data.items?.length || 0}`);
    
    if (totalItems > defaultItems) {
      console.log('⚠️  WARNING: Default pagination is limiting results!');
      console.log(`   - Missing ${totalItems - defaultItems} items with default pagination`);
      console.log('   - Frontend should use limit parameter to get all items');
    } else {
      console.log('✅ Default pagination is sufficient for current data');
    }

    // Test 5: Test all levels with large limits
    console.log('\n🔍 Test 4: Check all levels with large limits');
    for (let level = 1; level <= 5; level++) {
      const levelResponse = await axiosInstance.get('/extended-subcategories', {
        params: { level, limit: 1000 }
      });
      const itemCount = levelResponse.data.items?.length || 0;
      const totalCount = levelResponse.data.pagination?.totalItems || 0;
      console.log(`   - Level ${level}: ${itemCount} items (total: ${totalCount})`);
      
      if (itemCount !== totalCount) {
        console.log(`     ⚠️  WARNING: Level ${level} pagination issue detected!`);
      }
    }

    // Step 6: Test frontend API call simulation
    console.log('\n📋 Step 3: Test Frontend API Call Simulation');
    
    // Simulate current frontend call (without limit)
    console.log('\n🔍 Current frontend call (no limit):');
    const frontendCurrentResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1 }
    });
    console.log('   - Items received:', frontendCurrentResponse.data.items?.length || 0);
    
    // Simulate improved frontend call (with limit)
    console.log('\n🔍 Improved frontend call (with limit: 1000):');
    const frontendImprovedResponse = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1, limit: 1000 }
    });
    console.log('   - Items received:', frontendImprovedResponse.data.items?.length || 0);

    // Step 7: Recommendations
    console.log('\n📋 Step 4: Recommendations');
    
    if (totalItems > 10) {
      console.log('🔧 RECOMMENDATION: Update frontend to use limit parameter');
      console.log('   - Current: apiService.getExtendedSubcategories({ level: 1 })');
      console.log('   - Improved: apiService.getExtendedSubcategories({ level: 1, limit: 1000 })');
    } else {
      console.log('✅ Current pagination settings are adequate');
    }

    console.log('\n🎉 Pagination Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testExtendedSubcategoryPagination();