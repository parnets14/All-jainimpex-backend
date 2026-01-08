// test-se-attendance.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testSEAttendance() {
  console.log('🧪 Testing SE Attendance API for Nilesh...\n');

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

    // 2. Test SE Attendance APIs specifically
    console.log('\n2. Testing SE Attendance APIs...\n');
    
    const seTests = [
      { name: 'SE Attendance All', url: '/se/attendance/all' },
      { name: 'SE Attendance All with Date', url: '/se/attendance/all?date=2026-01-07' },
      { name: 'SE Attendance Today', url: '/se/attendance/today' },
      { name: 'SE Route Plan', url: '/se/route-plan' },
      { name: 'SE Dealer Insights', url: '/se/dealer-insights' },
      { name: 'SE Product Recommendations', url: '/se/product-recommendations' },
      { name: 'SE Collections', url: '/se/collections' },
      { name: 'SE Targets', url: '/se/targets' }
    ];

    for (const test of seTests) {
      try {
        console.log(`Testing ${test.name}...`);
        const response = await fetch(`${BASE_URL}${test.url}`, {
          method: 'GET',
          headers: headers
        });

        const responseText = await response.text();
        
        if (response.status === 200) {
          console.log(`✅ ${test.name}: 200 OK`);
          try {
            const data = JSON.parse(responseText);
            console.log(`   Response: ${JSON.stringify(data).substring(0, 100)}...`);
          } catch (e) {
            console.log(`   Response: ${responseText.substring(0, 100)}...`);
          }
        } else if (response.status === 403) {
          console.log(`❌ ${test.name}: 403 Forbidden`);
          console.log(`   Response: ${responseText}`);
        } else if (response.status === 404) {
          console.log(`⚠️  ${test.name}: 404 Not Found (endpoint may not exist)`);
        } else {
          console.log(`❌ ${test.name}: ${response.status}`);
          console.log(`   Response: ${responseText}`);
        }
      } catch (error) {
        console.log(`❌ ${test.name}: Network error - ${error.message}`);
      }
    }

    // 3. Check specific permissions that were mentioned in the error
    console.log('\n3. Checking specific permissions from error logs...\n');
    
    const userPermissions = loginData.user.permissions;
    const errorPermissions = [
      'se.attendance.view',
      'se.route.plan', 
      'se.dealer.insights',
      'se.product.recommendations',
      'se.collections.view',
      'se.targets.view',
      'de.assignment.manage',
      'de.monitoring.view',
      'de.deliveries.view',
      'de.tracking.view',
      'de.route.view',
      'de.collections.view'
    ];

    console.log('Permissions from error logs check:');
    errorPermissions.forEach(perm => {
      const hasPermission = userPermissions.includes(perm);
      const status = hasPermission ? '✅' : '❌';
      console.log(`  ${status} ${perm}`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSEAttendance();