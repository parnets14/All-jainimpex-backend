// test-permission-flow.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function testPermissionFlow() {
  console.log('🧪 Testing Complete Permission Assignment Flow...\n');

  try {
    // 1. Login as nilesh (sub_admin) to assign permissions
    console.log('1. Logging in as nilesh (sub_admin)...');
    const nileshLoginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'nilesh123@gmail.com',
        password: 'nilesh123'
      })
    });

    const nileshLoginData = await nileshLoginResponse.json();
    
    if (!nileshLoginData.success) {
      console.log('❌ Nilesh login failed:', nileshLoginData.message);
      return;
    }

    console.log('✅ Nilesh login successful');
    
    const nileshToken = nileshLoginData.token;
    const nileshHeaders = {
      'Authorization': `Bearer ${nileshToken}`,
      'Content-Type': 'application/json'
    };

    // 2. Get list of users to find a test user
    console.log('\n2. Getting users list...');
    const usersResponse = await fetch(`${BASE_URL}/users`, {
      method: 'GET',
      headers: nileshHeaders
    });

    if (usersResponse.status !== 200) {
      console.log('❌ Cannot access users list');
      return;
    }

    const usersData = await usersResponse.json();
    console.log(`✅ Found ${usersData.users.length} users`);

    // Find a test user (not super_admin or nilesh)
    const testUser = usersData.users.find(user => 
      user.role !== 'super_admin' && 
      user.email !== 'nilesh123@gmail.com' &&
      user.email !== 'superadmin@jainimpex.com'
    );

    if (!testUser) {
      console.log('❌ No suitable test user found');
      return;
    }

    console.log(`📋 Test user: ${testUser.name} (${testUser.email}) - Role: ${testUser.role}`);
    console.log(`Current permissions: ${testUser.permissions?.length || 0}`);

    // 3. Assign specific permissions to test user
    console.log('\n3. Assigning permissions to test user...');
    const testPermissions = [
      'dashboard.view',
      'master.management',
      'product.master',
      'dealer.master',
      'dealers.view',
      'dealers.create',
      'sales.purchase.management',
      'sales.order.dashboard'
    ];

    const updateResponse = await fetch(`${BASE_URL}/users/${testUser._id}/permissions`, {
      method: 'PUT',
      headers: nileshHeaders,
      body: JSON.stringify({
        permissions: testPermissions,
        assignedRegions: []
      })
    });

    if (updateResponse.status !== 200) {
      const errorData = await updateResponse.json();
      console.log('❌ Failed to update permissions:', errorData.message);
      return;
    }

    console.log(`✅ Assigned ${testPermissions.length} permissions to ${testUser.name}`);

    // 4. Verify permissions were saved
    console.log('\n4. Verifying permissions were saved...');
    const verifyResponse = await fetch(`${BASE_URL}/users/${testUser._id}`, {
      method: 'GET',
      headers: nileshHeaders
    });

    if (verifyResponse.status === 200) {
      const verifyData = await verifyResponse.json();
      console.log(`✅ User now has ${verifyData.user.permissions?.length || 0} permissions`);
      
      // Check if our test permissions are there
      const hasTestPermissions = testPermissions.every(perm => 
        verifyData.user.permissions?.includes(perm)
      );
      
      if (hasTestPermissions) {
        console.log('✅ All test permissions are saved correctly');
      } else {
        console.log('❌ Some test permissions are missing');
        console.log('Expected:', testPermissions);
        console.log('Actual:', verifyData.user.permissions);
      }
    }

    // 5. Test login with the updated user
    console.log('\n5. Testing login with updated user...');
    
    // We need the user's password - let's check if it's a known test user
    const knownTestUsers = {
      'admin@gmail.com': 'admin123',
      'amit123@gmail.com': 'amit123',
      'sales@gmail.com': 'sales123',
      'shubham123@gmail.com': 'shubham123',
      'sanvi@gmail.com': 'sanvi123',
      'sumankumar@gmail.com': 'suman123'
    };

    const testPassword = knownTestUsers[testUser.email];
    
    if (!testPassword) {
      console.log(`⚠️  Don't know password for ${testUser.email}, skipping login test`);
      console.log('Available test users:', Object.keys(knownTestUsers));
      return;
    }

    const testUserLoginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testPassword
      })
    });

    const testUserLoginData = await testUserLoginResponse.json();
    
    if (!testUserLoginData.success) {
      console.log('❌ Test user login failed:', testUserLoginData.message);
      return;
    }

    console.log('✅ Test user login successful');
    console.log(`Permissions in login response: ${testUserLoginData.user.permissions?.length || 0}`);

    // 6. Test API access with the test user
    console.log('\n6. Testing API access with test user...');
    const testUserHeaders = {
      'Authorization': `Bearer ${testUserLoginData.token}`,
      'Content-Type': 'application/json'
    };

    // Test APIs that should work with assigned permissions
    const apiTests = [
      { name: 'Dealers Stats', url: '/dealers/stats', permission: 'dealers.view' },
      { name: 'Products', url: '/products', permission: 'product.master' },
      { name: 'Sales Orders', url: '/sales-orders', permission: 'sales.order.dashboard' }
    ];

    for (const test of apiTests) {
      try {
        const response = await fetch(`${BASE_URL}${test.url}`, {
          method: 'GET',
          headers: testUserHeaders
        });

        const hasPermission = testPermissions.includes(test.permission);
        const expectedStatus = hasPermission ? 200 : 403;
        
        if (response.status === expectedStatus) {
          console.log(`✅ ${test.name}: ${response.status} (Expected: ${expectedStatus})`);
        } else {
          console.log(`❌ ${test.name}: ${response.status} (Expected: ${expectedStatus})`);
          if (response.status === 403) {
            const errorData = await response.json();
            console.log(`   Error: ${errorData.message}`);
          }
        }
      } catch (error) {
        console.log(`❌ ${test.name}: Network error - ${error.message}`);
      }
    }

    console.log('\n🎯 Summary:');
    console.log('===========');
    console.log('✅ Permission assignment flow tested');
    console.log('✅ User login with updated permissions tested');
    console.log('✅ API access with assigned permissions tested');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testPermissionFlow();