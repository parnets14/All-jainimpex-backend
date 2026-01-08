// test-se-api.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testSEAPI() {
  console.log('🧪 Testing Sales Executive API Access...\n');

  try {
    // 1. Login as nilesh
    console.log('1. Logging in as nilesh...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'nilesh123@gmail.com',
        password: 'nilesh123'
      })
    });

    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }

    console.log('✅ Nilesh login successful');
    console.log(`User role: ${loginData.user.role}`);
    console.log(`User permissions count: ${loginData.user.permissions.length}`);
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Test SE API endpoints
    console.log('\n2. Testing SE API endpoints...\n');
    
    const seEndpoints = [
      { name: 'SE Attendance All', url: '/se/attendance/all' },
      { name: 'SE Attendance Today', url: '/se/attendance/today' },
      { name: 'SE Attendance History', url: '/se/attendance/history' },
    ];

    for (const endpoint of seEndpoints) {
      try {
        console.log(`Testing ${endpoint.name}...`);
        const response = await fetch(`${BASE_URL}${endpoint.url}`, {
          method: 'GET',
          headers: headers
        });

        console.log(`Response status: ${response.status}`);
        
        if (response.status === 200) {
          console.log(`✅ ${endpoint.name} - SUCCESS`);
        } else if (response.status === 403) {
          const errorData = await response.json();
          console.log(`❌ ${endpoint.name} - 403 Forbidden: ${errorData.message}`);
        } else if (response.status === 404) {
          console.log(`⚠️  ${endpoint.name} - 404 Not Found (endpoint may not exist)`);
        } else {
          const errorData = await response.json();
          console.log(`❌ ${endpoint.name} - ${response.status}: ${errorData.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.log(`❌ ${endpoint.name} - Network error:`, error.message);
      }
      console.log('');
    }

    // 3. Test DE API endpoints
    console.log('3. Testing DE API endpoints...\n');
    
    const deEndpoints = [
      { name: 'DE Admin Pending Reschedules', url: '/admin/deliveries/pending-reschedules' },
      { name: 'DE Admin Failed Deliveries', url: '/admin/deliveries/failed-deliveries' },
    ];

    for (const endpoint of deEndpoints) {
      try {
        console.log(`Testing ${endpoint.name}...`);
        const response = await fetch(`${BASE_URL}${endpoint.url}`, {
          method: 'GET',
          headers: headers
        });

        console.log(`Response status: ${response.status}`);
        
        if (response.status === 200) {
          console.log(`✅ ${endpoint.name} - SUCCESS`);
        } else if (response.status === 403) {
          const errorData = await response.json();
          console.log(`❌ ${endpoint.name} - 403 Forbidden: ${errorData.message}`);
        } else if (response.status === 404) {
          console.log(`⚠️  ${endpoint.name} - 404 Not Found (endpoint may not exist)`);
        } else {
          const errorData = await response.json();
          console.log(`❌ ${endpoint.name} - ${response.status}: ${errorData.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.log(`❌ ${endpoint.name} - Network error:`, error.message);
      }
      console.log('');
    }

    console.log('🎯 Summary:');
    console.log('===========');
    console.log('Fixed SE protectAdmin middleware to include sub_admin role.');
    console.log('If SE APIs still fail, check for other role restrictions.');
    console.log('DE APIs should work as they use standard CRM protect middleware.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSEAPI();