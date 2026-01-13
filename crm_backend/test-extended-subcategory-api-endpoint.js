import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

async function testExtendedSubcategoryAPIEndpoint() {
  try {
    console.log('🧪 Testing Extended Subcategory API Endpoint\n');

    // Test 1: Login to get token
    console.log('📋 Test 1: Login');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: 'superadmin@jainimpex.com',
      password: 'superadmin123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Set up axios with token
    const apiClient = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Test 2: Get all extended subcategories level 1
    console.log('\n📋 Test 2: Get Extended Subcategories Level 1');
    try {
      const response = await apiClient.get('/extended-subcategories', {
        params: { level: 1 }
      });
      
      console.log('✅ API Response Status:', response.status);
      console.log('✅ Response Data Structure:');
      console.log('   - Success:', response.data.success);
      console.log('   - Items Count:', response.data.items?.length || 0);
      console.log('   - Pagination:', response.data.pagination);
      
      if (response.data.items && response.data.items.length > 0) {
        console.log('✅ Sample Items:');
        response.data.items.forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.name} (ID: ${item._id})`);
          console.log(`      Level: ${item.level}`);
          console.log(`      Category: ${item.category?.name || 'N/A'}`);
          console.log(`      Subcategory: ${item.subcategory?.name || 'N/A'}`);
        });
      } else {
        console.log('❌ No items returned');
      }
    } catch (error) {
      console.log('❌ API Error:', error.response?.data || error.message);
    }

    // Test 3: Get extended subcategories with different parameters
    console.log('\n📋 Test 3: Get Extended Subcategories with Filters');
    try {
      const response = await apiClient.get('/extended-subcategories', {
        params: { 
          level: 1,
          limit: 100
        }
      });
      
      console.log('✅ With limit=100:', response.data.items?.length || 0, 'items');
    } catch (error) {
      console.log('❌ API Error with filters:', error.response?.data || error.message);
    }

    // Test 4: Test the specific API method used by frontend
    console.log('\n📋 Test 4: Test Frontend API Method');
    try {
      // This simulates the getExtendedSubcategories call from frontend
      const response = await apiClient.get('/extended-subcategories', {
        params: { level: 1 }
      });
      
      console.log('✅ Frontend API simulation:');
      console.log('   - Items available:', response.data.items?.length || 0);
      console.log('   - Structure matches expected:', {
        hasItems: !!response.data.items,
        hasSuccess: !!response.data.success,
        hasPagination: !!response.data.pagination
      });
    } catch (error) {
      console.log('❌ Frontend API simulation error:', error.response?.data || error.message);
    }

    console.log('\n🎉 API Endpoint Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testExtendedSubcategoryAPIEndpoint();