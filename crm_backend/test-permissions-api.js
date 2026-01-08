// test-permissions-api.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testPermissionsAPI() {
  console.log('🧪 Testing Permissions Config API...\n');

  try {
    // 1. Login as super admin to access the API
    console.log('1. Logging in as super admin...');
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'superadmin@jainimpex.com',
        password: 'superadmin123'
      })
    });

    const loginData = await loginResponse.json();
    
    if (!loginData.success) {
      console.log('❌ Login failed:', loginData.message);
      return;
    }

    console.log('✅ Super admin login successful');
    
    const token = loginData.token;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Test permissions config API
    console.log('\n2. Testing permissions config API...');
    const response = await fetch(`${BASE_URL}/users/config/permissions`, {
      method: 'GET',
      headers: headers
    });

    console.log(`Response status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('✅ Permissions config API successful');
      console.log(`\n📊 Permissions Data:`);
      console.log(`Success: ${data.success}`);
      console.log(`Categories: ${Object.keys(data.permissions || {}).length}`);
      
      let totalPermissions = 0;
      Object.entries(data.permissions || {}).forEach(([category, permissions]) => {
        console.log(`  📁 ${category}: ${permissions.length} permissions`);
        totalPermissions += permissions.length;
      });
      
      console.log(`\n🎯 Total Permissions Available: ${totalPermissions}`);
      console.log(`Regions Available: ${data.regions?.length || 0}`);
      
      // Check if all expected categories are present
      const expectedCategories = [
        'General',
        'Master Management', 
        'Sales & Purchase Management',
        'Inventory & Warehouse Control',
        'HRMS Administration',
        'Finance & Accounts',
        'Reports & Logs',
        'Expense Management',
        'Support & Communication',
        'Sales Executive App',
        'Delivery Executive App'
      ];
      
      console.log('\n📋 Category Check:');
      expectedCategories.forEach(category => {
        const exists = data.permissions && data.permissions[category];
        const status = exists ? '✅' : '❌';
        const count = exists ? data.permissions[category].length : 0;
        console.log(`  ${status} ${category} (${count} permissions)`);
      });
      
    } else {
      const errorData = await response.json();
      console.log(`❌ Permissions config API failed: ${response.status}`);
      console.log(`Error: ${errorData.message || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPermissionsAPI();