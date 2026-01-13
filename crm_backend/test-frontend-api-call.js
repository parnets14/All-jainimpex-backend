// Test frontend API call simulation
import axios from 'axios';

const API_BASE_URL = "http://localhost:5000/api";

async function testFrontendAPICall() {
  try {
    console.log('🧪 Testing Frontend API Call Simulation\n');

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

    // Step 2: Create axios instance like frontend
    const axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    // Step 3: Test the exact API call that frontend makes
    console.log('\n📋 Step 2: Test Frontend API Call');
    console.log('Making request to: /extended-subcategories?level=1');
    
    const response = await axiosInstance.get('/extended-subcategories', {
      params: { level: 1 }
    });

    console.log('✅ API Response Status:', response.status);
    console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));

    // Step 4: Simulate frontend processing
    console.log('\n📋 Step 3: Simulate Frontend Processing');
    const items = response.data.items || [];
    console.log('✅ Items extracted:', items.length);
    
    if (items.length > 0) {
      console.log('✅ Sample items:');
      items.slice(0, 3).forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} (ID: ${item._id})`);
      });
    } else {
      console.log('❌ No items found');
    }

    console.log('\n🎉 Frontend API Call Test Complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testFrontendAPICall();