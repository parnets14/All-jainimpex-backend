// test-frontend-permissions.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testFrontendPermissions() {
  console.log('🧪 Testing Frontend Permissions API Call...\n');

  try {
    // 1. Login as nilesh (to simulate frontend user)
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
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Test the exact API call that frontend makes
    console.log('\n2. Testing frontend permissions API call...');
    const response = await fetch(`${BASE_URL}/users/config/permissions`, {
      method: 'GET',
      headers: headers
    });

    console.log(`Response status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('✅ Frontend permissions API successful');
      
      console.log(`\n📊 Data Structure Check:`);
      console.log(`- success: ${data.success}`);
      console.log(`- permissions: ${data.permissions ? 'Present' : 'Missing'}`);
      console.log(`- regions: ${data.regions ? 'Present' : 'Missing'}`);
      console.log(`- rolePermissions: ${data.rolePermissions ? 'Present' : 'Missing'}`);
      
      if (data.permissions) {
        console.log(`\n📁 Categories Available:`);
        let totalPermissions = 0;
        Object.entries(data.permissions).forEach(([category, permissions]) => {
          console.log(`  ✅ ${category}: ${permissions.length} permissions`);
          totalPermissions += permissions.length;
          
          // Show first few permissions as sample
          if (permissions.length > 0) {
            console.log(`     Sample: ${permissions[0].name} (${permissions[0].id})`);
          }
        });
        
        console.log(`\n🎯 Total: ${totalPermissions} permissions`);
        
        // Check if this matches what we expect
        if (totalPermissions === 100) {
          console.log('✅ All 100 permissions are available to frontend!');
        } else {
          console.log(`❌ Expected 100 permissions, got ${totalPermissions}`);
        }
      } else {
        console.log('❌ No permissions data in response');
      }
      
    } else if (response.status === 403) {
      console.log('❌ 403 Forbidden - User may not have access to permissions config');
      const errorData = await response.json();
      console.log(`Error: ${errorData.message}`);
    } else {
      const errorData = await response.json();
      console.log(`❌ API failed: ${response.status}`);
      console.log(`Error: ${errorData.message || 'Unknown error'}`);
    }

    // 3. Test if nilesh can access user management
    console.log('\n3. Testing user management access...');
    const usersResponse = await fetch(`${BASE_URL}/users`, {
      method: 'GET',
      headers: headers
    });
    
    console.log(`Users API status: ${usersResponse.status}`);
    if (usersResponse.status === 200) {
      console.log('✅ Nilesh can access user management');
    } else {
      console.log('❌ Nilesh cannot access user management');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFrontendPermissions();